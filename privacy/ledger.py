"""Conservative single-publisher ledger. A reservation survives any failed draw/export."""
import sqlite3
import math
from contextlib import contextmanager

@contextmanager
def connect(path):
    path.parent.mkdir(parents=True,exist_ok=True)
    con=sqlite3.connect(path,timeout=30,isolation_level=None)
    con.execute('PRAGMA journal_mode=WAL'); con.execute('PRAGMA synchronous=FULL')
    con.execute('CREATE TABLE IF NOT EXISTS releases (id TEXT PRIMARY KEY, identity TEXT UNIQUE NOT NULL, epsilon REAL NOT NULL, state TEXT NOT NULL, artifact_hash TEXT)')
    try: yield con
    finally: con.close()

def reserve(path, release_id, identity, epsilon=1.0, limit=1.0):
    if not math.isfinite(epsilon) or epsilon<=0 or not math.isfinite(limit) or limit<0: raise ValueError('INVALID_BUDGET')
    with connect(path) as con:
        con.execute('BEGIN IMMEDIATE')
        row=con.execute('SELECT identity,state,artifact_hash FROM releases WHERE id=?',(release_id,)).fetchone()
        if row:
            con.execute('COMMIT')
            if row[0]!=identity: raise ValueError('RELEASE_CONFLICT')
            if row[1]!='committed': raise ValueError('RELEASE_INTERRUPTED: reservation remains spent; no automatic redraw')
            return row[2]
        if con.execute('SELECT 1 FROM releases WHERE identity=?',(identity,)).fetchone():
            raise ValueError('RELEASE_CONFLICT: same request has another release ID')
        spent=con.execute('SELECT COALESCE(SUM(epsilon),0) FROM releases').fetchone()[0]
        if spent+epsilon>limit+1e-12: raise ValueError('BUDGET_EXHAUSTED')
        con.execute('INSERT INTO releases VALUES(?,?,?,?,NULL)',(release_id,identity,epsilon,'reserved'))
        con.execute('COMMIT')
    return None

def commit(path,release_id,identity,artifact_hash):
    with connect(path) as con:
        changed=con.execute("UPDATE releases SET state='committed',artifact_hash=? WHERE id=? AND identity=? AND state='reserved'",(artifact_hash,release_id,identity)).rowcount
        if changed!=1: raise ValueError('RELEASE_CONFLICT')
