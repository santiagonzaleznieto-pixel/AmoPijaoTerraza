"""
app.py — I.E. Instituto Pijao, sistema escolar local.

Cómo ejecutarla:
    pip install -r requirements.txt
    python app.py
Luego abre http://127.0.0.1:5000 en el navegador.

Todo (notas, asistencia, usuarios, etc.) se guarda en instituto_pijao.db,
un archivo en esta misma carpeta. No sale de este computador.
"""
import os
import secrets
from datetime import date, timedelta
from functools import wraps

from flask import Flask, render_template, request, redirect, url_for, session, flash, abort
from werkzeug.security import generate_password_hash, check_password_hash

import database as db

app = Flask(__name__)

# La llave de sesión se genera una vez y se guarda en un archivo local para
# que las sesiones no se cierren cada vez que reinicies el servidor.
SECRET_KEY_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), ".secret_key")
if os.path.exists(SECRET_KEY_PATH):
    app.secret_key = open(SECRET_KEY_PATH, "r").read().strip()
else:
    key = secrets.token_hex(32)
    with open(SECRET_KEY_PATH, "w") as f:
        f.write(key)
    app.secret_key = key


# ---------------------------------------------------------------------------
# Utilidades de fecha / nivel
# ---------------------------------------------------------------------------
def hoy_iso():
    return date.today().isoformat()


def sumar_dias(iso, n):
    y, m, d = [int(x) for x in iso.split("-")]
    return (date(y, m, d) + timedelta(days=n)).isoformat()


def formato_fecha(iso):
    if not iso:
        return "—"
    y, m, d = iso.split("-")
    return f"{d}/{m}/{y}"


def nivel_label(v):
    return db.NIVEL_LABEL.get(v, "Sin nota")


def ventana_final(periodo_idx, inst_row):
    cierre = inst_row[f"cierre_p{periodo_idx + 1}"]
    if not cierre:
        return {"abierta": True, "motivo": "sin_fecha"}
    hoy = hoy_iso()
    inicio_ventana = sumar_dias(cierre, -7)
    if hoy < inicio_ventana:
        return {"abierta": False, "motivo": "muy_pronto", "fecha": inicio_ventana}
    if hoy > cierre:
        return {"abierta": False, "motivo": "ya_cerro", "fecha": cierre}
    return {"abierta": True, "motivo": "en_ventana"}


# ---------------------------------------------------------------------------
# Autenticación
# ---------------------------------------------------------------------------
def current_user():
    usr = session.get("usuario")
    if not usr:
        return None
    conn = db.get_conn()
    row = conn.execute("SELECT * FROM usuarios WHERE usuario=?", (usr,)).fetchone()
    conn.close()
    return row


def login_required(f):
    @wraps(f)
    def wrapper(*args, **kwargs):
        if not current_user():
            return redirect(url_for("login"))
        return f(*args, **kwargs)
    return wrapper


def role_required(*roles):
    def decorator(f):
        @wraps(f)
        def wrapper(*args, **kwargs):
            user = current_user()
            if not user:
                return redirect(url_for("login"))
            if user["rol"] not in roles:
                abort(403)
            return f(*args, **kwargs)
        return wrapper
    return decorator


def nombre_grado(gid):
    conn = db.get_conn()
    row = conn.execute("SELECT nombre FROM grados WHERE id=?", (gid,)).fetchone()
    conn.close()
    return row["nombre"] if row else gid


def tabs_de_rol(rol, es_director):
    if rol == "estudiante":
        return [("boletin", "Mi boletín", "boletin"), ("asistencia", "Asistencia", "asistencia_estudiante"),
                ("anotaciones", "Anotaciones", "anotaciones_estudiante"), ("comunicados", "Comunicados", "comunicados_estudiante"),
                ("agenda", "Agenda", "agenda"), ("notificaciones", "Notificaciones", "notificaciones")]
    if rol == "profesor":
        t = [("cursos", "Mis materias", "cursos")]
        if es_director:
            t.append(("grupo", "Mi grupo", "grupo_estudiantes"))
        t += [("anotaciones", "Anotaciones", "anotaciones_profesor"), ("agenda", "Agenda", "agenda"),
              ("notificaciones", "Notificaciones", "notificaciones"), ("perfil", "Mi perfil", "perfil")]
        return t
    t = [("panel", "Panel institucional", "panel_institucional"), ("anotaciones", "Anotaciones", "anotaciones_direccion"),
         ("agenda", "Agenda", "agenda"), ("config", "Configuración", "configuracion")]
    if rol == "administrador":
        t.append(("admin", "Administración", "admin_profesores"))
    t += [("notificaciones", "Notificaciones", "notificaciones"), ("perfil", "Mi perfil", "perfil")]
    return t


@app.context_processor
def inject_globals():
    user = current_user()
    unread = 0
    if user:
        conn = db.get_conn()
        unread = conn.execute("SELECT COUNT(*) c FROM notificaciones WHERE usuario=? AND leida=0",
                               (user["usuario"],)).fetchone()["c"]
        conn.close()
    return dict(
        session_user=user,
        unread_count=unread,
        tabs=tabs_de_rol(user["rol"], user["es_director_de"]) if user else [],
        tab_activo=request.endpoint,
        nombre_grado=nombre_grado,
        formato_fecha=formato_fecha,
        NIVEL_LABEL=db.NIVEL_LABEL,
        NIVELES=db.NIVELES,
        PERIODOS=db.PERIODOS,
    )


# ---------------------------------------------------------------------------
# Notificaciones y recordatorios
# ---------------------------------------------------------------------------
def notificar(conn, usuarios_destino, texto):
    if isinstance(usuarios_destino, str):
        usuarios_destino = [usuarios_destino]
    for usr in usuarios_destino:
        if not usr:
            continue
        conn.execute("INSERT INTO notificaciones (usuario,fecha,texto,leida) VALUES (?,?,?,0)",
                     (usr, hoy_iso(), texto))


def todos_los_profesores(conn):
    return [r["usuario"] for r in conn.execute("SELECT usuario FROM usuarios WHERE rol='profesor'")]


def toda_direccion(conn):
    return [r["usuario"] for r in conn.execute("SELECT usuario FROM usuarios WHERE rol IN ('coordinadora','rectora')")]


def procesar_recordatorios():
    """Revisa eventos de mañana y notifica (dentro de la app) a quien
    corresponda, una sola vez por evento y persona."""
    conn = db.get_conn()
    manana = sumar_dias(hoy_iso(), 1)
    eventos = conn.execute("SELECT * FROM eventos WHERE fecha=?", (manana,)).fetchall()
    for ev in eventos:
        if ev["tipo"] == "general":
            destinatarios = [r["usuario"] for r in conn.execute("SELECT usuario FROM usuarios")]
        else:
            destinatarios = todos_los_profesores(conn) + toda_direccion(conn)
        for usr in destinatarios:
            ya = conn.execute("SELECT 1 FROM evento_recordado WHERE evento_id=? AND usuario=?",
                               (ev["id"], usr)).fetchone()
            if ya:
                continue
            notificar(conn, usr, f"Recordatorio: mañana {formato_fecha(ev['fecha'])} — {ev['titulo']} "
                                  f"(agenda {'general' if ev['tipo']=='general' else 'de directivos'})")
            conn.execute("INSERT INTO evento_recordado (evento_id,usuario) VALUES (?,?)", (ev["id"], usr))
    conn.commit()
    conn.close()


# ---------------------------------------------------------------------------
# Login / logout
# ---------------------------------------------------------------------------
@app.route("/login", methods=["GET", "POST"])
def login():
    if current_user():
        return redirect(url_for("index"))
    conn = db.get_conn()
    inst = conn.execute("SELECT * FROM institucion WHERE id=1").fetchone()
    if request.method == "POST":
        usuario = request.form.get("usuario", "").strip().lower()
        clave = request.form.get("clave", "")
        row = conn.execute("SELECT * FROM usuarios WHERE usuario=?", (usuario,)).fetchone()
        conn.close()
        if not row or not check_password_hash(row["password_hash"], clave):
            flash("Usuario o contraseña incorrectos.", "error")
            return redirect(url_for("login"))
        session.clear()
        session["usuario"] = usuario
        return redirect(url_for("index"))
    conn.close()
    return render_template("login.html", inst=inst, password_demo=db.PASSWORD_DEMO)


@app.route("/logout")
def logout():
    session.clear()
    return redirect(url_for("login"))


@app.route("/")
@login_required
def index():
    user = current_user()
    if user["rol"] == "estudiante":
        return redirect(url_for("boletin"))
    if user["rol"] == "profesor":
        return redirect(url_for("cursos"))
    return redirect(url_for("panel_institucional"))


# ---------------------------------------------------------------------------
# Estudiante
# ---------------------------------------------------------------------------
@app.route("/estudiante/boletin")
@role_required("estudiante")
def boletin():
    user = current_user()
    periodo = int(request.args.get("periodo", 0))
    conn = db.get_conn()
    materias = conn.execute(
        "SELECT m.id, m.nombre FROM materias m JOIN materia_grado mg ON mg.materia_id=m.id "
        "WHERE mg.grado_id=? ORDER BY m.nombre", (user["grado_id"],)).fetchall()
    filas = []
    resumen_anual = []
    for m in materias:
        parciales = conn.execute(
            "SELECT nombre, valor FROM notas_parciales WHERE estudiante_usuario=? AND materia_id=? AND grado_id=? AND periodo=?",
            (user["usuario"], m["id"], user["grado_id"], periodo)).fetchall()
        final = conn.execute(
            "SELECT valor FROM notas_finales WHERE estudiante_usuario=? AND materia_id=? AND grado_id=? AND periodo=?",
            (user["usuario"], m["id"], user["grado_id"], periodo)).fetchone()
        finales_anio = []
        for p in range(4):
            f = conn.execute(
                "SELECT valor FROM notas_finales WHERE estudiante_usuario=? AND materia_id=? AND grado_id=? AND periodo=?",
                (user["usuario"], m["id"], user["grado_id"], p)).fetchone()
            finales_anio.append(f["valor"] if f else None)
        filas.append(dict(materia=m, parciales=parciales, final=final["valor"] if final else None))
        resumen_anual.append(dict(materia=m, finales=finales_anio))
    conn.close()
    return render_template("estudiante/boletin.html", filas=filas, resumen_anual=resumen_anual, periodo=periodo)


@app.route("/estudiante/asistencia")
@role_required("estudiante")
def asistencia_estudiante():
    user = current_user()
    conn = db.get_conn()
    registros = conn.execute(
        "SELECT fecha, estado FROM asistencia WHERE estudiante_usuario=? ORDER BY fecha DESC", (user["usuario"],)).fetchall()
    conn.close()
    totales = {"presente": 0, "ausente": 0, "excusa": 0}
    for r in registros:
        totales[r["estado"]] += 1
    return render_template("estudiante/asistencia.html", registros=registros, totales=totales)


@app.route("/estudiante/anotaciones")
@role_required("estudiante")
def anotaciones_estudiante():
    user = current_user()
    conn = db.get_conn()
    lista = conn.execute(
        "SELECT * FROM anotaciones WHERE estudiante_usuario=? ORDER BY fecha DESC", (user["usuario"],)).fetchall()
    conn.close()
    return render_template("estudiante/anotaciones.html", lista=lista)


@app.route("/estudiante/comunicados")
@role_required("estudiante")
def comunicados_estudiante():
    user = current_user()
    conn = db.get_conn()
    lista = conn.execute(
        "SELECT * FROM comunicados WHERE grado_id=? ORDER BY fecha DESC", (user["grado_id"],)).fetchall()
    conn.close()
    return render_template("estudiante/comunicados.html", lista=lista)


# ---------------------------------------------------------------------------
# Compartidas: agenda, notificaciones, perfil
# ---------------------------------------------------------------------------
@app.route("/agenda", methods=["GET", "POST"])
@login_required
def agenda():
    user = current_user()
    puede_crear = user["rol"] in ("profesor", "coordinadora", "rectora")
    solo_general = user["rol"] == "estudiante"
    tipo = "general" if solo_general else request.values.get("tipo", "general")
    conn = db.get_conn()
    if request.method == "POST":
        if not puede_crear:
            abort(403)
        titulo = request.form.get("titulo", "").strip()
        fecha = request.form.get("fecha", "")
        descripcion = request.form.get("descripcion", "").strip()
        tipo_post = request.form.get("tipo", "general")
        if not titulo or not fecha:
            flash("Completa al menos el título y la fecha.", "error")
        else:
            conn.execute(
                "INSERT INTO eventos (titulo,descripcion,fecha,tipo,autor_usuario,autor_nombre) VALUES (?,?,?,?,?,?)",
                (titulo, descripcion, fecha, tipo_post, user["usuario"], user["nombre"]))
            conn.commit()
            flash("Actividad programada.", "exito")
        return redirect(url_for("agenda", tipo=tipo_post))
    lista = conn.execute("SELECT * FROM eventos WHERE tipo=? ORDER BY fecha ASC", (tipo,)).fetchall()
    conn.close()
    return render_template("agenda.html", lista=lista, tipo=tipo, puede_crear=puede_crear,
                            solo_general=solo_general, hoy=hoy_iso())


@app.route("/notificaciones", methods=["GET", "POST"])
@login_required
def notificaciones():
    user = current_user()
    conn = db.get_conn()
    if request.method == "POST":
        conn.execute("UPDATE notificaciones SET leida=1 WHERE usuario=?", (user["usuario"],))
        conn.commit()
        conn.close()
        return redirect(url_for("notificaciones"))
    lista = conn.execute("SELECT * FROM notificaciones WHERE usuario=? ORDER BY id DESC", (user["usuario"],)).fetchall()
    conn.close()
    return render_template("notificaciones.html", lista=lista)


@app.route("/perfil", methods=["GET", "POST"])
@role_required("profesor", "coordinadora", "rectora", "administrador")
def perfil():
    user = current_user()
    conn = db.get_conn()
    if request.method == "POST":
        wa = request.form.get("whatsapp", "").strip()
        co = request.form.get("correo", "").strip()
        conn.execute("UPDATE usuarios SET whatsapp=?, correo=? WHERE usuario=?", (wa, co, user["usuario"]))
        conn.commit()
        conn.close()
        flash("Datos guardados.", "exito")
        return redirect(url_for("perfil"))
    conn.close()
    return render_template("perfil.html", user=user)


# ---------------------------------------------------------------------------
# Profesor: materias y notas
# ---------------------------------------------------------------------------
def cursos_del_profesor(conn, usuario):
    rows = conn.execute(
        "SELECT pd.materia_id, m.nombre AS materia_nombre, pd.grado_id, g.nombre AS grado_nombre "
        "FROM profesor_dicta pd JOIN materias m ON m.id=pd.materia_id JOIN grados g ON g.id=pd.grado_id "
        "WHERE pd.profesor_usuario=? ORDER BY g.orden, m.nombre", (usuario,)).fetchall()
    return rows


def grados_asociados_profesor(conn, user):
    ids = set(r["grado_id"] for r in conn.execute(
        "SELECT DISTINCT grado_id FROM profesor_dicta WHERE profesor_usuario=?", (user["usuario"],)))
    if user["es_director_de"]:
        ids.add(user["es_director_de"])
    filas = conn.execute("SELECT id, nombre FROM grados WHERE id IN ({}) ORDER BY orden".format(
        ",".join("?" * len(ids)) or "''"), tuple(ids)).fetchall() if ids else []
    return filas


@app.route("/profesor/cursos")
@role_required("profesor")
def cursos():
    user = current_user()
    conn = db.get_conn()
    lista = cursos_del_profesor(conn, user["usuario"])
    conn.close()
    return render_template("profesor/cursos.html", lista=lista)


@app.route("/profesor/curso/<materia_id>/<grado_id>", methods=["GET", "POST"])
@role_required("profesor")
def curso_notas(materia_id, grado_id):
    user = current_user()
    conn = db.get_conn()
    autorizado = conn.execute(
        "SELECT 1 FROM profesor_dicta WHERE profesor_usuario=? AND materia_id=? AND grado_id=?",
        (user["usuario"], materia_id, grado_id)).fetchone()
    if not autorizado:
        conn.close()
        abort(403)
    materia = conn.execute("SELECT * FROM materias WHERE id=?", (materia_id,)).fetchone()
    grado = conn.execute("SELECT * FROM grados WHERE id=?", (grado_id,)).fetchone()
    inst = conn.execute("SELECT * FROM institucion WHERE id=1").fetchone()
    periodo = int(request.values.get("periodo", 0))

    if request.method == "POST":
        accion = request.form.get("accion")
        est_id = request.form.get("estudiante")
        pertenece = conn.execute(
            "SELECT 1 FROM usuarios WHERE usuario=? AND grado_id=?", (est_id, grado_id)).fetchone()
        if not pertenece:
            conn.close()
            abort(400)
        if accion == "agregar_parcial":
            nombre_nota = request.form.get("nombre_nota", "").strip()
            valor = request.form.get("valor")
            if not nombre_nota or valor not in db.NIVELES:
                flash("Escribe el nombre de la nota y elige un nivel válido.", "error")
            else:
                conn.execute(
                    "INSERT INTO notas_parciales (estudiante_usuario,materia_id,grado_id,periodo,nombre,valor) "
                    "VALUES (?,?,?,?,?,?)", (est_id, materia_id, grado_id, periodo, nombre_nota, valor))
                nombre_est = conn.execute("SELECT nombre FROM usuarios WHERE usuario=?", (est_id,)).fetchone()["nombre"]
                notificar(conn, est_id, f"Nueva nota registrada en {materia['nombre']}: {nombre_nota} — {nivel_label(valor)}.")
                conn.commit()
                flash(f"Nota agregada para {nombre_est}.", "exito")
        elif accion == "quitar_parcial":
            parcial_id = request.form.get("parcial_id")
            conn.execute("DELETE FROM notas_parciales WHERE id=? AND estudiante_usuario=? AND materia_id=? AND grado_id=?",
                         (parcial_id, est_id, materia_id, grado_id))
            conn.commit()
            flash("Nota eliminada.", "exito")
        elif accion == "nota_final":
            ventana = ventana_final(periodo, inst)
            if not ventana["abierta"]:
                flash("La nota final de este período no está habilitada todavía.", "error")
            else:
                valor = request.form.get("valor")
                if valor not in db.NIVELES:
                    flash("Elige un nivel válido.", "error")
                else:
                    conn.execute(
                        "INSERT INTO notas_finales (estudiante_usuario,materia_id,grado_id,periodo,valor) VALUES (?,?,?,?,?) "
                        "ON CONFLICT(estudiante_usuario,materia_id,grado_id,periodo) DO UPDATE SET valor=excluded.valor",
                        (est_id, materia_id, grado_id, periodo, valor))
                    notificar(conn, est_id, f"Tu nota final de {materia['nombre']} en el {db.PERIODOS[periodo]} quedó: {nivel_label(valor)}.")
                    conn.commit()
                    flash("Nota final guardada.", "exito")
        return redirect(url_for("curso_notas", materia_id=materia_id, grado_id=grado_id, periodo=periodo))

    ventana = ventana_final(periodo, inst)
    estudiantes = conn.execute("SELECT usuario, nombre FROM usuarios WHERE grado_id=? ORDER BY nombre", (grado_id,)).fetchall()
    filas = []
    for est in estudiantes:
        parciales = conn.execute(
            "SELECT id, nombre, valor FROM notas_parciales WHERE estudiante_usuario=? AND materia_id=? AND grado_id=? AND periodo=?",
            (est["usuario"], materia_id, grado_id, periodo)).fetchall()
        final = conn.execute(
            "SELECT valor FROM notas_finales WHERE estudiante_usuario=? AND materia_id=? AND grado_id=? AND periodo=?",
            (est["usuario"], materia_id, grado_id, periodo)).fetchone()
        filas.append(dict(estudiante=est, parciales=parciales, final=final["valor"] if final else None))
    conn.close()
    return render_template("profesor/curso_notas.html", materia=materia, grado=grado, periodo=periodo,
                            filas=filas, ventana=ventana)


# ---------------------------------------------------------------------------
# Profesor: Mi grupo (solo director de grupo)
# ---------------------------------------------------------------------------
def director_required(f):
    @wraps(f)
    def wrapper(*args, **kwargs):
        user = current_user()
        if not user or user["rol"] != "profesor" or not user["es_director_de"]:
            abort(403)
        return f(*args, **kwargs)
    return wrapper


@app.route("/grupo/estudiantes", methods=["GET", "POST"])
@director_required
def grupo_estudiantes():
    user = current_user()
    gid = user["es_director_de"]
    conn = db.get_conn()
    credencial = None
    if request.method == "POST":
        accion = request.form.get("accion")
        if accion == "agregar":
            nombre = request.form.get("nombre", "").strip()
            wa = request.form.get("whatsapp", "").strip()
            co = request.form.get("correo", "").strip()
            if not nombre:
                flash("Escribe el nombre completo del estudiante.", "error")
            else:
                usr = generar_usuario(conn, nombre)
                ph = generate_password_hash(db.PASSWORD_DEMO)
                conn.execute(
                    "INSERT INTO usuarios (usuario,nombre,rol,password_hash,grado_id,whatsapp,correo) "
                    "VALUES (?,?,'estudiante',?,?,?,?)", (usr, nombre, ph, gid, wa, co))
                conn.commit()
                credencial = dict(usuario=usr, password=db.PASSWORD_DEMO, nombre=nombre)
        elif accion == "quitar":
            est_id = request.form.get("estudiante")
            conn.execute("DELETE FROM usuarios WHERE usuario=? AND grado_id=?", (est_id, gid))
            conn.commit()
            flash("Estudiante retirado del grupo.", "exito")
        elif accion == "editar_contacto":
            est_id = request.form.get("estudiante")
            wa = request.form.get("whatsapp", "").strip()
            co = request.form.get("correo", "").strip()
            conn.execute("UPDATE usuarios SET whatsapp=?, correo=? WHERE usuario=? AND grado_id=?", (wa, co, est_id, gid))
            conn.commit()
            flash("Contacto actualizado.", "exito")
    grado = conn.execute("SELECT * FROM grados WHERE id=?", (gid,)).fetchone()
    estudiantes = conn.execute("SELECT * FROM usuarios WHERE grado_id=? ORDER BY nombre", (gid,)).fetchall()
    conn.close()
    return render_template("profesor/grupo_estudiantes.html", grado=grado, estudiantes=estudiantes, credencial=credencial)


def generar_usuario(conn, nombre_completo):
    import unicodedata
    partes = unicodedata.normalize("NFKD", nombre_completo.lower()).encode("ascii", "ignore").decode()
    partes = "".join(c if c.isalnum() or c.isspace() else " " for c in partes).split()
    base = (partes[0] if partes else "est") + "." + (partes[1] if len(partes) > 1 else (partes[0] if partes else "pijao"))
    usr, i = base, 2
    while conn.execute("SELECT 1 FROM usuarios WHERE usuario=?", (usr,)).fetchone():
        usr = f"{base}{i}"
        i += 1
    return usr


@app.route("/grupo/consolidado")
@director_required
def grupo_consolidado():
    user = current_user()
    gid = user["es_director_de"]
    periodo = int(request.args.get("periodo", 0))
    conn = db.get_conn()
    grado = conn.execute("SELECT * FROM grados WHERE id=?", (gid,)).fetchone()
    materias = conn.execute(
        "SELECT m.id, m.nombre FROM materias m JOIN materia_grado mg ON mg.materia_id=m.id "
        "WHERE mg.grado_id=? ORDER BY m.nombre", (gid,)).fetchall()
    estudiantes = conn.execute("SELECT usuario, nombre FROM usuarios WHERE grado_id=? ORDER BY nombre", (gid,)).fetchall()
    tabla = []
    for est in estudiantes:
        fila = {"estudiante": est, "notas": []}
        for m in materias:
            f = conn.execute(
                "SELECT valor FROM notas_finales WHERE estudiante_usuario=? AND materia_id=? AND grado_id=? AND periodo=?",
                (est["usuario"], m["id"], gid, periodo)).fetchone()
            fila["notas"].append(f["valor"] if f else None)
        tabla.append(fila)
    conn.close()
    return render_template("profesor/grupo_consolidado.html", grado=grado, materias=materias, tabla=tabla, periodo=periodo)


@app.route("/grupo/asistencia", methods=["GET", "POST"])
@director_required
def grupo_asistencia():
    user = current_user()
    gid = user["es_director_de"]
    conn = db.get_conn()
    fecha = request.values.get("fecha") or hoy_iso()
    if request.method == "POST":
        estudiantes = conn.execute("SELECT usuario FROM usuarios WHERE grado_id=?", (gid,)).fetchall()
        for est in estudiantes:
            estado = request.form.get(f"estado_{est['usuario']}")
            if estado in ("presente", "ausente", "excusa"):
                conn.execute(
                    "INSERT INTO asistencia (grado_id,fecha,estudiante_usuario,estado) VALUES (?,?,?,?) "
                    "ON CONFLICT(grado_id,fecha,estudiante_usuario) DO UPDATE SET estado=excluded.estado",
                    (gid, fecha, est["usuario"], estado))
                if estado in ("ausente", "excusa"):
                    notificar(conn, est["usuario"],
                              f"Registro de asistencia del {formato_fecha(fecha)}: {'Ausente' if estado=='ausente' else 'Con excusa'}.")
        conn.commit()
        flash("Asistencia guardada.", "exito")
        return redirect(url_for("grupo_asistencia", fecha=fecha))
    grado = conn.execute("SELECT * FROM grados WHERE id=?", (gid,)).fetchone()
    estudiantes = conn.execute("SELECT usuario, nombre FROM usuarios WHERE grado_id=? ORDER BY nombre", (gid,)).fetchall()
    estados = {}
    for est in estudiantes:
        r = conn.execute("SELECT estado FROM asistencia WHERE grado_id=? AND fecha=? AND estudiante_usuario=?",
                          (gid, fecha, est["usuario"])).fetchone()
        estados[est["usuario"]] = r["estado"] if r else "presente"
    conn.close()
    return render_template("profesor/grupo_asistencia.html", grado=grado, estudiantes=estudiantes, estados=estados, fecha=fecha)


@app.route("/grupo/comunicados", methods=["GET", "POST"])
@director_required
def grupo_comunicados():
    user = current_user()
    gid = user["es_director_de"]
    conn = db.get_conn()
    if request.method == "POST":
        titulo = request.form.get("titulo", "").strip()
        texto = request.form.get("texto", "").strip()
        if not titulo or not texto:
            flash("Completa título y mensaje.", "error")
        else:
            conn.execute("INSERT INTO comunicados (grado_id,titulo,texto,fecha,autor) VALUES (?,?,?,?,?)",
                         (gid, titulo, texto, hoy_iso(), user["nombre"]))
            estudiantes = [r["usuario"] for r in conn.execute("SELECT usuario FROM usuarios WHERE grado_id=?", (gid,))]
            notificar(conn, estudiantes, f"Nuevo comunicado de {nombre_grado(gid)}: {titulo}")
            conn.commit()
            flash("Comunicado publicado.", "exito")
        return redirect(url_for("grupo_comunicados"))
    grado = conn.execute("SELECT * FROM grados WHERE id=?", (gid,)).fetchone()
    lista = conn.execute("SELECT * FROM comunicados WHERE grado_id=? ORDER BY fecha DESC", (gid,)).fetchall()
    conn.close()
    return render_template("profesor/grupo_comunicados.html", grado=grado, lista=lista)


# ---------------------------------------------------------------------------
# Anotaciones (cualquier profesor, sobre estudiantes de sus grados asociados)
# ---------------------------------------------------------------------------
@app.route("/profesor/anotaciones", methods=["GET", "POST"])
@role_required("profesor")
def anotaciones_profesor():
    user = current_user()
    conn = db.get_conn()
    grados_prof = grados_asociados_profesor(conn, user)
    grado_ids_validos = [g["id"] for g in grados_prof]
    if request.method == "POST":
        gid = request.form.get("grado_id")
        est_id = request.form.get("estudiante")
        texto = request.form.get("texto", "").strip()
        if gid not in grado_ids_validos:
            conn.close()
            abort(403)
        pertenece = conn.execute("SELECT nombre FROM usuarios WHERE usuario=? AND grado_id=?", (est_id, gid)).fetchone()
        if not pertenece or not texto:
            flash("Escribe el contenido de la anotación.", "error")
        else:
            conn.execute(
                "INSERT INTO anotaciones (estudiante_usuario,grado_id,fecha,texto,autor_usuario,autor_nombre) "
                "VALUES (?,?,?,?,?,?)", (est_id, gid, hoy_iso(), texto, user["usuario"], user["nombre"]))
            destinatarios = [est_id] + todos_los_profesores(conn) + toda_direccion(conn)
            notificar(conn, destinatarios, f"Nueva anotación registrada para {pertenece['nombre']} por {user['nombre']}.")
            conn.commit()
            flash("Anotación guardada.", "exito")
        return redirect(url_for("anotaciones_profesor"))
    todas = conn.execute(
        "SELECT a.*, u.nombre AS estudiante_nombre, g.nombre AS grado_nombre FROM anotaciones a "
        "JOIN usuarios u ON u.usuario=a.estudiante_usuario JOIN grados g ON g.id=a.grado_id "
        "ORDER BY a.fecha DESC").fetchall()
    estudiantes_por_grado = {}
    for g in grados_prof:
        estudiantes_por_grado[g["id"]] = conn.execute(
            "SELECT usuario, nombre FROM usuarios WHERE grado_id=? ORDER BY nombre", (g["id"],)).fetchall()
    conn.close()
    return render_template("profesor/anotaciones.html", grados_prof=grados_prof,
                            estudiantes_por_grado=estudiantes_por_grado, todas=todas)


# ---------------------------------------------------------------------------
# Dirección (Coordinadora / Rectora)
# ---------------------------------------------------------------------------
@app.route("/direccion/panel")
@role_required("coordinadora", "rectora", "administrador")
def panel_institucional():
    conn = db.get_conn()
    grados_todos = conn.execute("SELECT * FROM grados ORDER BY orden").fetchall()
    gid = request.args.get("grado", grados_todos[0]["id"])
    periodo = int(request.args.get("periodo", 0))
    grado = conn.execute("SELECT * FROM grados WHERE id=?", (gid,)).fetchone()
    director = conn.execute("SELECT nombre FROM usuarios WHERE usuario=?", (grado["director_usuario"],)).fetchone()
    materias = conn.execute(
        "SELECT m.id, m.nombre FROM materias m JOIN materia_grado mg ON mg.materia_id=m.id "
        "WHERE mg.grado_id=? ORDER BY m.nombre", (gid,)).fetchall()
    estudiantes = conn.execute("SELECT usuario, nombre, whatsapp, correo FROM usuarios WHERE grado_id=? ORDER BY nombre", (gid,)).fetchall()
    tabla = []
    for est in estudiantes:
        fila = {"estudiante": est, "notas": []}
        for m in materias:
            f = conn.execute(
                "SELECT valor FROM notas_finales WHERE estudiante_usuario=? AND materia_id=? AND grado_id=? AND periodo=?",
                (est["usuario"], m["id"], gid, periodo)).fetchone()
            fila["notas"].append(f["valor"] if f else None)
        tabla.append(fila)
    asistencia_resumen = []
    for est in estudiantes:
        conteos = {"presente": 0, "ausente": 0, "excusa": 0}
        for r in conn.execute("SELECT estado FROM asistencia WHERE grado_id=? AND estudiante_usuario=?", (gid, est["usuario"])):
            conteos[r["estado"]] += 1
        asistencia_resumen.append(dict(estudiante=est, **conteos))
    conn.close()
    return render_template("direccion/panel.html", grados_todos=grados_todos, grado=grado, director=director,
                            materias=materias, tabla=tabla, periodo=periodo, estudiantes=estudiantes,
                            asistencia_resumen=asistencia_resumen)


@app.route("/direccion/anotaciones")
@role_required("coordinadora", "rectora", "administrador")
def anotaciones_direccion():
    conn = db.get_conn()
    todas = conn.execute(
        "SELECT a.*, u.nombre AS estudiante_nombre, g.nombre AS grado_nombre FROM anotaciones a "
        "JOIN usuarios u ON u.usuario=a.estudiante_usuario JOIN grados g ON g.id=a.grado_id "
        "ORDER BY a.fecha DESC").fetchall()
    conn.close()
    return render_template("direccion/anotaciones.html", todas=todas)


@app.route("/direccion/config", methods=["GET", "POST"])
@role_required("coordinadora", "rectora", "administrador")
def configuracion():
    conn = db.get_conn()
    if request.method == "POST":
        campos = []
        valores = []
        for i in range(1, 5):
            campos.append(f"cierre_p{i}=?")
            valores.append(request.form.get(f"cierre_p{i}") or None)
        conn.execute(f"UPDATE institucion SET {','.join(campos)} WHERE id=1", valores)
        conn.commit()
        flash("Fechas guardadas.", "exito")
        return redirect(url_for("configuracion"))
    inst = conn.execute("SELECT * FROM institucion WHERE id=1").fetchone()
    conn.close()
    return render_template("direccion/config.html", inst=inst)


# ---------------------------------------------------------------------------
# Administrador — control total: profesores, materias y quién queda
# autorizado a poner notas (asignación de materia+grado a cada profesor).
# ---------------------------------------------------------------------------
@app.route("/admin/profesores", methods=["GET", "POST"])
@role_required("administrador")
def admin_profesores():
    conn = db.get_conn()
    if request.method == "POST":
        accion = request.form.get("accion")
        if accion == "agregar":
            nombre = request.form.get("nombre", "").strip()
            if not nombre:
                flash("Escribe el nombre completo del profesor.", "error")
            else:
                usr = generar_usuario(conn, nombre)
                ph = generate_password_hash(db.PASSWORD_DEMO)
                conn.execute(
                    "INSERT INTO usuarios (usuario,nombre,rol,password_hash,whatsapp,correo) "
                    "VALUES (?,?,'profesor',?,'','')", (usr, nombre, ph))
                conn.commit()
                flash(f"Profesor agregado. Usuario: {usr} · Contraseña inicial: {db.PASSWORD_DEMO}", "exito")
        elif accion == "eliminar":
            usr = request.form.get("usuario")
            dirige = conn.execute("SELECT id, nombre FROM grados WHERE director_usuario=?", (usr,)).fetchone()
            if dirige:
                flash(f"No puedes eliminarlo: es director de grupo de {dirige['nombre']}. "
                      f"Reasigna esa dirección de grupo primero en Asignaciones.", "error")
            else:
                conn.execute("DELETE FROM profesor_dicta WHERE profesor_usuario=?", (usr,))
                conn.execute("DELETE FROM usuarios WHERE usuario=? AND rol='profesor'", (usr,))
                conn.commit()
                flash("Profesor eliminado.", "exito")
        elif accion == "restablecer_clave":
            usr = request.form.get("usuario")
            ph = generate_password_hash(db.PASSWORD_DEMO)
            conn.execute("UPDATE usuarios SET password_hash=? WHERE usuario=?", (ph, usr))
            conn.commit()
            flash(f"Contraseña de {usr} restablecida a: {db.PASSWORD_DEMO}", "exito")
        return redirect(url_for("admin_profesores"))
    profesores = conn.execute(
        "SELECT u.*, g.nombre AS dirige_nombre FROM usuarios u LEFT JOIN grados g ON g.director_usuario=u.usuario "
        "WHERE u.rol='profesor' ORDER BY u.nombre").fetchall()
    dicta_por_profesor = {}
    for p in profesores:
        filas = conn.execute(
            "SELECT m.nombre AS materia_nombre, g.nombre AS grado_nombre FROM profesor_dicta pd "
            "JOIN materias m ON m.id=pd.materia_id JOIN grados g ON g.id=pd.grado_id "
            "WHERE pd.profesor_usuario=? ORDER BY g.orden", (p["usuario"],)).fetchall()
        dicta_por_profesor[p["usuario"]] = filas
    conn.close()
    return render_template("admin/profesores.html", profesores=profesores, dicta_por_profesor=dicta_por_profesor,
                            password_demo=db.PASSWORD_DEMO)


@app.route("/admin/materias", methods=["GET", "POST"])
@role_required("administrador")
def admin_materias():
    conn = db.get_conn()
    grados_todos = conn.execute("SELECT * FROM grados ORDER BY orden").fetchall()
    if request.method == "POST":
        accion = request.form.get("accion")
        if accion == "agregar":
            nombre = request.form.get("nombre", "").strip()
            grados_marcados = request.form.getlist("grados")
            if not nombre:
                flash("Escribe el nombre de la materia.", "error")
            else:
                mid = "mat-" + "".join(c if c.isalnum() else "-" for c in nombre.lower()).strip("-")[:40]
                i = 2
                base_mid = mid
                while conn.execute("SELECT 1 FROM materias WHERE id=?", (mid,)).fetchone():
                    mid = f"{base_mid}-{i}"
                    i += 1
                conn.execute("INSERT INTO materias (id,nombre) VALUES (?,?)", (mid, nombre))
                for gid in grados_marcados:
                    conn.execute("INSERT INTO materia_grado (materia_id,grado_id) VALUES (?,?)", (mid, gid))
                conn.commit()
                flash(f"Materia «{nombre}» creada.", "exito")
        elif accion == "actualizar_grados":
            mid = request.form.get("materia_id")
            grados_marcados = request.form.getlist("grados")
            conn.execute("DELETE FROM materia_grado WHERE materia_id=?", (mid,))
            for gid in grados_marcados:
                conn.execute("INSERT INTO materia_grado (materia_id,grado_id) VALUES (?,?)", (mid, gid))
            conn.commit()
            flash("Grados de la materia actualizados.", "exito")
        elif accion == "eliminar":
            mid = request.form.get("materia_id")
            conn.execute("DELETE FROM materia_grado WHERE materia_id=?", (mid,))
            conn.execute("DELETE FROM profesor_dicta WHERE materia_id=?", (mid,))
            conn.execute("DELETE FROM materias WHERE id=?", (mid,))
            conn.commit()
            flash("Materia eliminada. Las notas ya registradas para ella quedan en el historial.", "exito")
        return redirect(url_for("admin_materias"))
    materias = conn.execute("SELECT * FROM materias ORDER BY nombre").fetchall()
    grados_de_materia = {}
    for m in materias:
        grados_de_materia[m["id"]] = set(r["grado_id"] for r in conn.execute(
            "SELECT grado_id FROM materia_grado WHERE materia_id=?", (m["id"],)))
    conn.close()
    return render_template("admin/materias.html", materias=materias, grados_todos=grados_todos,
                            grados_de_materia=grados_de_materia)


@app.route("/admin/asignaciones", methods=["GET", "POST"])
@role_required("administrador")
def admin_asignaciones():
    conn = db.get_conn()
    grados_todos = conn.execute("SELECT * FROM grados ORDER BY orden").fetchall()
    gid = request.values.get("grado", grados_todos[0]["id"])
    if request.method == "POST":
        accion = request.form.get("accion")
        if accion == "asignar_director":
            nuevo = request.form.get("profesor") or None
            conn.execute("UPDATE usuarios SET es_director_de=NULL WHERE es_director_de=?", (gid,))
            if nuevo:
                conn.execute("UPDATE usuarios SET es_director_de=? WHERE usuario=?", (gid, nuevo))
            conn.execute("UPDATE grados SET director_usuario=? WHERE id=?", (nuevo, gid))
            conn.commit()
            flash("Dirección de grupo actualizada. Esto autoriza a esa persona a manejar la lista, "
                  "asistencia y comunicados de este grado.", "exito")
        elif accion == "asignar_materia":
            mid = request.form.get("materia_id")
            nuevo = request.form.get("profesor") or None
            conn.execute("DELETE FROM profesor_dicta WHERE materia_id=? AND grado_id=?", (mid, gid))
            if nuevo:
                conn.execute("INSERT INTO profesor_dicta (profesor_usuario,materia_id,grado_id) VALUES (?,?,?)",
                              (nuevo, mid, gid))
            conn.commit()
            flash("Asignación guardada. Esto autoriza (o retira la autorización) a poner notas finales en esa materia.", "exito")
        return redirect(url_for("admin_asignaciones", grado=gid))
    grado = conn.execute("SELECT * FROM grados WHERE id=?", (gid,)).fetchone()
    profesores = conn.execute("SELECT usuario, nombre FROM usuarios WHERE rol='profesor' ORDER BY nombre").fetchall()
    materias = conn.execute(
        "SELECT m.id, m.nombre FROM materias m JOIN materia_grado mg ON mg.materia_id=m.id "
        "WHERE mg.grado_id=? ORDER BY m.nombre", (gid,)).fetchall()
    asignaciones = {}
    for m in materias:
        r = conn.execute("SELECT profesor_usuario FROM profesor_dicta WHERE materia_id=? AND grado_id=?",
                          (m["id"], gid)).fetchone()
        asignaciones[m["id"]] = r["profesor_usuario"] if r else None
    conn.close()
    return render_template("admin/asignaciones.html", grados_todos=grados_todos, grado=grado,
                            profesores=profesores, materias=materias, asignaciones=asignaciones)


# ---------------------------------------------------------------------------
# Esto corre siempre (tanto si ejecutas "python app.py" como si un servidor
# WSGI real -p. ej. PythonAnywhere- importa "app" desde este archivo), para
# que la base de datos quede creada y sembrada en cualquiera de los dos casos.
db.inicializar_si_hace_falta()
procesar_recordatorios()

if __name__ == "__main__":
    # Modo desarrollo local: python app.py
    # DEBUG queda apagado por defecto -- en un servidor real, un error con
    # debug=True permite ejecutar código Python desde el navegador, así que
    # nunca debe quedar encendido fuera de tu propio computador.
    debug = os.environ.get("FLASK_DEBUG", "0") == "1"
    port = int(os.environ.get("PORT", 5000))
    print(f"\n  I.E. Instituto Pijao — abre http://127.0.0.1:{port} en tu navegador\n")
    app.run(debug=debug, host="127.0.0.1", port=port)
