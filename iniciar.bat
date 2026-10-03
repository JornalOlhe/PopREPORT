@echo off
setlocal
cd /d "%~dp0"
title PopReport - MySQL + Spotify

echo ==============================================
echo              POPREPORT - INICIAR
echo ==============================================
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo [ERRO] Node.js nao foi encontrado neste computador.
  echo Instale o Node.js e tente novamente.
  pause
  exit /b 1
)

if not exist ".env.local" (
  copy /y ".env" ".env.local" >nul
  echo [CONFIG] Arquivo .env.local criado.
  echo          Se precisar, preencha DB_PASSWORD e as credenciais do Spotify nele.
  echo.
)

if not exist "node_modules\mysql2\package.json" (
  echo [1/3] Instalando dependencias do projeto...
  call npm install
  if errorlevel 1 (
    echo [ERRO] Falha no npm install.
    pause
    exit /b 1
  )
) else (
  echo [1/3] Dependencias ja instaladas.
)

echo [2/3] Preparando banco de dados MySQL...
call npm run db:setup
if errorlevel 1 (
  echo.
  echo [AVISO] O banco nao foi preparado.
  echo Verifique se o MySQL esta iniciado e confira DB_USER/DB_PASSWORD no .env.local.
  echo O site ainda vai abrir, mas o cadastro no banco ficara indisponivel.
  echo.
)

echo [3/3] Iniciando servidor...
echo.
echo Abra no navegador: http://127.0.0.1:3000
echo Para encerrar, pressione Ctrl+C.
echo.
call npm start
pause
