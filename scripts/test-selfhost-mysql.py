"""Run the PHP integration tests against a disposable, socket-only MySQL 8 server.

Usage: python3 scripts/test-selfhost-mysql.py /path/to/php /path/to/mysql-distribution
The server is never installed as a system service; no hosting-provider credentials are used.
"""
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import time

php = str(Path(sys.argv[1]).resolve())
distribution = Path(sys.argv[2]).resolve()
mysqld = str(distribution / 'bin/mysqld')
mysql = str(distribution / 'bin/mysql')

with tempfile.TemporaryDirectory(prefix='gt-mysql-') as temp:
    root = Path(temp)
    data = root / 'data'
    socket = root / 'mysql.sock'
    log = root / 'mysql.log'
    initialize = subprocess.run([mysqld, '--no-defaults', '--initialize-insecure', '--basedir=' + str(distribution), '--datadir=' + str(data), '--log-error=' + str(log)], capture_output=True, text=True, timeout=90)
    if initialize.returncode:
        raise RuntimeError('MySQL test initialization failed: ' + initialize.stderr + (log.read_text() if log.exists() else ''))
    process = subprocess.Popen([mysqld, '--no-defaults', '--basedir=' + str(distribution), '--datadir=' + str(data), '--socket=' + str(socket), '--pid-file=' + str(root / 'mysql.pid'), '--log-error=' + str(log), '--skip-networking', '--mysqlx=OFF', '--innodb-buffer-pool-size=64M', '--max-connections=20'], stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
    try:
        for _ in range(200):
            if process.poll() is not None:
                raise RuntimeError('MySQL test startup failed: ' + process.stderr.read().decode() + log.read_text())
            if socket.exists():
                ready = subprocess.run([mysql, '--no-defaults', '--socket=' + str(socket), '--user=root', '--execute=SELECT 1'], capture_output=True)
                if ready.returncode == 0:
                    break
            time.sleep(.1)
        else:
            raise RuntimeError('MySQL test startup timed out')
        environment = {**os.environ, 'GT_TEST_MYSQL_BIN': mysql, 'GT_TEST_MYSQL_SOCKET': str(socket)}
        result = subprocess.run([sys.executable, str(Path(__file__).with_name('test-selfhost.py')), php], env=environment)
        if result.returncode:
            raise SystemExit(result.returncode)
    finally:
        process.terminate()
        process.wait(timeout=30)
