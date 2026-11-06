"""Only versioned, clean production code may identify a new publication."""
from pathlib import Path
import subprocess
from importlib.metadata import version

PRODUCTION_PATHS=['pipeline','privacy','contracts','requirements-routesafe.lock']

def publisher_revision(root:Path|None=None)->str:
    root=root or Path(__file__).resolve().parents[1]
    def git(*args):
        result=subprocess.run(['git','-C',str(root),*args],capture_output=True,text=True)
        if result.returncode:raise ValueError('UNVERSIONED_PUBLISHER')
        return result.stdout.strip()
    if git('status','--porcelain','--untracked-files=normal','--',*PRODUCTION_PATHS):
        raise ValueError('UNCOMMITTED_PUBLISHER: commit production code before publishing')
    return git('rev-parse','--verify','HEAD^{commit}')

def runtime_identity():
    versions={name:version(name) for name in ['opendp','pandas','numpy']}
    if versions['opendp']!='0.16.0':raise ValueError('UNSUPPORTED_MECHANISM_VERSION')
    return versions
