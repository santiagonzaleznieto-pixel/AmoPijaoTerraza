"""
database.py — Esquema SQLite y datos semilla para el sistema escolar
I.E. Instituto Pijao.

Toda la información vive en un único archivo instituto_pijao.db en esta
misma carpeta. No se conecta a internet ni a ningún servidor externo:
todo queda en este computador.
"""
import sqlite3
import os
from datetime import date
from werkzeug.security import generate_password_hash

DB_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "instituto_pijao.db")

PERIODOS = ["Período 1", "Período 2", "Período 3", "Período 4"]
NIVELES = ["bajo", "basico", "alto", "superior"]
NIVEL_LABEL = {"bajo": "Bajo", "basico": "Básico", "alto": "Alto", "superior": "Superior"}
PASSWORD_DEMO = "pijao2026"


def get_conn():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


SCHEMA = """
CREATE TABLE IF NOT EXISTS institucion (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    nombre TEXT, municipio TEXT, fundacion TEXT, lema TEXT,
    cierre_p1 TEXT, cierre_p2 TEXT, cierre_p3 TEXT, cierre_p4 TEXT
);
CREATE TABLE IF NOT EXISTS grados (
    id TEXT PRIMARY KEY, nombre TEXT NOT NULL, director_usuario TEXT, orden INTEGER
);
CREATE TABLE IF NOT EXISTS materias (
    id TEXT PRIMARY KEY, nombre TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS materia_grado (
    materia_id TEXT NOT NULL, grado_id TEXT NOT NULL,
    PRIMARY KEY (materia_id, grado_id)
);
CREATE TABLE IF NOT EXISTS usuarios (
    usuario TEXT PRIMARY KEY,
    nombre TEXT NOT NULL,
    rol TEXT NOT NULL CHECK(rol IN ('estudiante','profesor','coordinadora','rectora','administrador')),
    password_hash TEXT NOT NULL,
    grado_id TEXT,
    es_director_de TEXT,
    whatsapp TEXT DEFAULT '',
    correo TEXT DEFAULT ''
);
CREATE TABLE IF NOT EXISTS profesor_dicta (
    profesor_usuario TEXT NOT NULL, materia_id TEXT NOT NULL, grado_id TEXT NOT NULL,
    PRIMARY KEY (profesor_usuario, materia_id, grado_id)
);
CREATE TABLE IF NOT EXISTS notas_parciales (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    estudiante_usuario TEXT NOT NULL, materia_id TEXT NOT NULL, grado_id TEXT NOT NULL,
    periodo INTEGER NOT NULL, nombre TEXT NOT NULL, valor TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS notas_finales (
    estudiante_usuario TEXT NOT NULL, materia_id TEXT NOT NULL, grado_id TEXT NOT NULL,
    periodo INTEGER NOT NULL, valor TEXT NOT NULL,
    PRIMARY KEY (estudiante_usuario, materia_id, grado_id, periodo)
);
CREATE TABLE IF NOT EXISTS asistencia (
    grado_id TEXT NOT NULL, fecha TEXT NOT NULL, estudiante_usuario TEXT NOT NULL,
    estado TEXT NOT NULL CHECK(estado IN ('presente','ausente','excusa')),
    PRIMARY KEY (grado_id, fecha, estudiante_usuario)
);
CREATE TABLE IF NOT EXISTS anotaciones (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    estudiante_usuario TEXT NOT NULL, grado_id TEXT NOT NULL, fecha TEXT NOT NULL,
    texto TEXT NOT NULL, autor_usuario TEXT NOT NULL, autor_nombre TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS comunicados (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    grado_id TEXT NOT NULL, titulo TEXT NOT NULL, texto TEXT NOT NULL,
    fecha TEXT NOT NULL, autor TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS eventos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    titulo TEXT NOT NULL, descripcion TEXT, fecha TEXT NOT NULL,
    tipo TEXT NOT NULL CHECK(tipo IN ('general','directivos')),
    autor_usuario TEXT, autor_nombre TEXT
);
CREATE TABLE IF NOT EXISTS evento_recordado (
    evento_id INTEGER NOT NULL, usuario TEXT NOT NULL,
    PRIMARY KEY (evento_id, usuario)
);
CREATE TABLE IF NOT EXISTS notificaciones (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    usuario TEXT NOT NULL, fecha TEXT NOT NULL, texto TEXT NOT NULL, leida INTEGER DEFAULT 0
);
"""

# ---------------------------------------------------------------------------
# Datos semilla — mismos grados/materias/profesores/estudiantes ya validados
# en la versión web, con contraseña de ejemplo pijao2026 para todos.
# ---------------------------------------------------------------------------

GRADOS = [
    ("transicion", "Transición", "y.restrepo", ["sara.osorio", "samuel.bedoya", "isabella.cardenas"]),
    ("g1", "1°", "c.gomez", ["mateo.vargas", "salome.restrepo", "juan.marulanda"]),
    ("g2", "2°", "d.loaiza", ["valeria.gomez", "santiago.cardenas", "emily.patino"]),
    ("g3", "3°", "f.salazar", ["nicolas.herrera", "maria.ospina", "tomas.londono"]),
    ("g4", "4°", "l.ocampo", ["luciana.zapata", "jeronimo.castano", "antonella.ramirez"]),
    ("g5", "5°", "j.marin", ["sebastian.quintero", "danna.betancur", "emmanuel.torres"]),
    ("g6", "6°", "j.cardenas", ["karol.buritica", "yeison.morales", "mariana.sepulveda"]),
    ("g7", "7°", "s.grajales", ["brayan.marin", "laura.ospina", "kevin.duque"]),
    ("g8", "8°", "a.trejos", ["manuela.rendon", "jhojan.aristizabal", "paula.ceballos"]),
    ("g9", "9°", "n.rios", ["cristian.velez", "nataly.jimenez", "andres.correa"]),
    ("g10", "10°", "h.aguirre", ["melany.osorio", "juan.restrepo", "sharon.loaiza"]),
    ("g11", "11°", "c.munoz", ["esteban.gutierrez", "valentina.munoz", "andres.rios"]),
]
PRIMARIA = ["g1", "g2", "g3", "g4", "g5"]
SECUNDARIA = ["g6", "g7", "g8", "g9", "g10", "g11"]
TODO_COLEGIO = PRIMARIA + SECUNDARIA

MATERIAS = [
    ("dim-cog", "Dimensión Cognitiva", ["transicion"]),
    ("dim-com", "Dimensión Comunicativa", ["transicion"]),
    ("dim-cor", "Dimensión Corporal", ["transicion"]),
    ("dim-soc", "Dimensión Socio-afectiva", ["transicion"]),
    ("dim-est", "Dimensión Estética", ["transicion"]),
    ("matematicas", "Matemáticas", TODO_COLEGIO),
    ("castellano", "Lengua Castellana", TODO_COLEGIO),
    ("ingles", "Inglés", TODO_COLEGIO),
    ("naturales", "Ciencias Naturales", TODO_COLEGIO),
    ("sociales", "Ciencias Sociales", TODO_COLEGIO),
    ("etica", "Ética y Valores", TODO_COLEGIO),
    ("religion", "Educación Religiosa", TODO_COLEGIO),
    ("artistica", "Educación Artística", TODO_COLEGIO),
    ("fisica", "Educación Física", TODO_COLEGIO),
    ("tic", "Proyectos TIC", ["g3", "g4", "g5"] + SECUNDARIA),
    ("politicas", "Constitución Política y Democracia", SECUNDARIA),
    ("filosofia", "Filosofía", ["g10", "g11"]),
]

# usuario -> (nombre, rol, grado_id_o_None, es_director_de_o_None, dicta[(materia,[grados])])
PROFESORES = {
    "y.restrepo": ("Yolanda Restrepo", "transicion", [
        ("dim-cog", ["transicion"]), ("dim-com", ["transicion"]), ("dim-cor", ["transicion"]),
        ("dim-soc", ["transicion"]), ("dim-est", ["transicion"])]),
    "c.gomez": ("Carlos Mario Gómez", "g1", [
        ("matematicas", ["g1"]), ("castellano", ["g1"]), ("sociales", ["g1"]),
        ("naturales", ["g1"]), ("etica", ["g1"])]),
    "d.loaiza": ("Diana Patricia Loaiza", "g2", [
        ("matematicas", ["g2"]), ("castellano", ["g2"]), ("sociales", ["g2"]),
        ("naturales", ["g2"]), ("etica", ["g2"])]),
    "f.salazar": ("Fernando Salazar", "g3", [
        ("matematicas", ["g3"]), ("castellano", ["g3"]), ("sociales", ["g3"]),
        ("naturales", ["g3"]), ("etica", ["g3"])]),
    "l.ocampo": ("Luz Marina Ocampo", "g4", [
        ("matematicas", ["g4"]), ("castellano", ["g4"]), ("sociales", ["g4"]),
        ("naturales", ["g4"]), ("etica", ["g4"])]),
    "j.marin": ("Jhon Édison Marín", "g5", [
        ("matematicas", ["g5"]), ("castellano", ["g5"]), ("sociales", ["g5"]),
        ("naturales", ["g5"]), ("etica", ["g5"])]),
    "a.buitrago": ("Andrea Buitrago", None, [("ingles", PRIMARIA)]),
    "w.tapasco": ("Wilmar Tapasco", None, [("fisica", TODO_COLEGIO)]),
    "e.quintero": ("Edwin Quintero", None, [("artistica", TODO_COLEGIO)]),
    "g.henao": ("Gustavo Henao", None, [("religion", TODO_COLEGIO)]),
    "j.estrada": ("Julián Estrada", None, [("tic", ["g3", "g4", "g5"] + SECUNDARIA)]),
    "j.cardenas": ("Jorge Iván Cárdenas", "g6", [("sociales", SECUNDARIA)]),
    "s.grajales": ("Sandra Milena Grajales", "g7", [("naturales", SECUNDARIA)]),
    "a.trejos": ("Álvaro Trejos", "g8", [("castellano", SECUNDARIA)]),
    "n.rios": ("Nubia Esperanza Ríos", "g9", [("etica", SECUNDARIA), ("politicas", SECUNDARIA)]),
    "h.aguirre": ("Hernán Darío Aguirre", "g10", [("filosofia", ["g10", "g11"])]),
    "c.munoz": ("Claudia Isabel Muñoz", "g11", [("matematicas", SECUNDARIA)]),
    "s.londono": ("Sebastián Londoño", None, [("ingles", SECUNDARIA)]),
}

ESTUDIANTES = {
    "sara.osorio": ("Sara Valentina Osorio", "transicion"),
    "samuel.bedoya": ("Samuel David Bedoya", "transicion"),
    "isabella.cardenas": ("Isabella Cárdenas Ruiz", "transicion"),
    "mateo.vargas": ("Mateo Alejandro Vargas", "g1"),
    "salome.restrepo": ("Salomé Restrepo Duque", "g1"),
    "juan.marulanda": ("Juan Esteban Marulanda", "g1"),
    "valeria.gomez": ("Valeria Gómez Toro", "g2"),
    "santiago.cardenas": ("Santiago Cárdenas León", "g2"),
    "emily.patino": ("Emily Sofía Patiño", "g2"),
    "nicolas.herrera": ("Nicolás Herrera Villa", "g3"),
    "maria.ospina": ("María Fernanda Ospina", "g3"),
    "tomas.londono": ("Tomás Londoño Ríos", "g3"),
    "luciana.zapata": ("Luciana Zapata Peña", "g4"),
    "jeronimo.castano": ("Jerónimo Castaño", "g4"),
    "antonella.ramirez": ("Antonella Ramírez", "g4"),
    "sebastian.quintero": ("Sebastián Quintero Mesa", "g5"),
    "danna.betancur": ("Danna Sofía Betancur", "g5"),
    "emmanuel.torres": ("Emmanuel Torres Grisales", "g5"),
    "karol.buritica": ("Karol Ximena Buriticá", "g6"),
    "yeison.morales": ("Yeison Andrés Morales", "g6"),
    "mariana.sepulveda": ("Mariana Sepúlveda", "g6"),
    "brayan.marin": ("Brayan Estiven Marín", "g7"),
    "laura.ospina": ("Laura Camila Ospina", "g7"),
    "kevin.duque": ("Kevin Alexis Duque", "g7"),
    "manuela.rendon": ("Manuela Rendón", "g8"),
    "jhojan.aristizabal": ("Jhojan David Aristizábal", "g8"),
    "paula.ceballos": ("Paula Andrea Ceballos", "g8"),
    "cristian.velez": ("Cristian Camilo Vélez", "g9"),
    "nataly.jimenez": ("Nataly Jiménez Arango", "g9"),
    "andres.correa": ("Andrés Felipe Correa", "g9"),
    "melany.osorio": ("Melany Osorio Cárdenas", "g10"),
    "juan.restrepo": ("Juan Pablo Restrepo", "g10"),
    "sharon.loaiza": ("Sharon Daniela Loaiza", "g10"),
    "esteban.gutierrez": ("Esteban Gutiérrez Villa", "g11"),
    "valentina.munoz": ("Valentina Muñoz Trejos", "g11"),
    "andres.rios": ("Andrés Camilo Ríos", "g11"),
}

ADMIN = {
    "rectora": ("Martha Cecilia Vallejo", "rectora"),
    "coordinadora": ("Diana Lorena Betancur", "coordinadora"),
    "admin": ("Administrador del sistema", "administrador"),
}


def ya_existe_bd():
    return os.path.exists(DB_PATH)


def inicializar_si_hace_falta():
    """Crea el esquema y siembra los datos de ejemplo solo si el archivo
    de base de datos todavía no existe. Si ya existe, no toca nada."""
    nuevo = not ya_existe_bd()
    conn = get_conn()
    conn.executescript(SCHEMA)
    if nuevo:
        _sembrar(conn)
    conn.commit()
    conn.close()


def _sembrar(conn):
    ph = generate_password_hash(PASSWORD_DEMO)

    conn.execute(
        "INSERT INTO institucion (id,nombre,municipio,fundacion,lema,cierre_p1,cierre_p2,cierre_p3,cierre_p4) "
        "VALUES (1,?,?,?,?,NULL,NULL,NULL,NULL)",
        ("Institución Educativa Instituto Pijao", "Pijao, Quindío", "1947",
         "Sapientiam a juventute dilexi et quaesivi"),
    )

    for orden, (gid, nombre, director, _est) in enumerate(GRADOS):
        conn.execute("INSERT INTO grados (id,nombre,director_usuario,orden) VALUES (?,?,?,?)",
                     (gid, nombre, director, orden))

    for mid, nombre, _grados in MATERIAS:
        conn.execute("INSERT INTO materias (id,nombre) VALUES (?,?)", (mid, nombre))
    for mid, _nombre, grados_aplica in MATERIAS:
        for gid in grados_aplica:
            conn.execute("INSERT INTO materia_grado (materia_id,grado_id) VALUES (?,?)", (mid, gid))

    for usr, (nombre, rol) in ADMIN.items():
        conn.execute(
            "INSERT INTO usuarios (usuario,nombre,rol,password_hash,whatsapp,correo) VALUES (?,?,?,?,'','')",
            (usr, nombre, rol, ph))

    for usr, (nombre, director_de, dicta) in PROFESORES.items():
        conn.execute(
            "INSERT INTO usuarios (usuario,nombre,rol,password_hash,es_director_de,whatsapp,correo) "
            "VALUES (?,?,'profesor',?,?,'','')",
            (usr, nombre, ph, director_de))
        for materia_id, grados_lista in dicta:
            for gid in grados_lista:
                conn.execute(
                    "INSERT INTO profesor_dicta (profesor_usuario,materia_id,grado_id) VALUES (?,?,?)",
                    (usr, materia_id, gid))

    for usr, (nombre, gid) in ESTUDIANTES.items():
        conn.execute(
            "INSERT INTO usuarios (usuario,nombre,rol,password_hash,grado_id,whatsapp,correo) "
            "VALUES (?,?,'estudiante',?,?,'','')",
            (usr, nombre, ph, gid))
