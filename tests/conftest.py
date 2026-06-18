import os, tempfile, pytest

_tmp = tempfile.NamedTemporaryFile(suffix='.db', delete=False)
_tmp.close()
os.environ['QUIZ_DB'] = _tmp.name  # set BEFORE any test module imports db
