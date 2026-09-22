@echo off
cd /d "%~dp0"
echo Open http://127.0.0.1:4318 in your browser after the server starts.
node --env-file-if-exists=.env server.mjs
pause
