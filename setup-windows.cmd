@echo off
title Bingo Royale - one-time setup
cd /d "%~dp0"
echo ============================================
echo  Bingo Royale - one-time setup (Windows)
echo ============================================

where bun >nul 2>nul
if errorlevel 1 (
  echo [ERROR] bun not found. Install from bun.sh first, then reopen the terminal.
  pause
  exit /b 1
)

if not exist .env (
  echo DATABASE_URL="file:../db/custom.db">.env
  echo [ok] created .env
) else (
  echo [ok] .env already exists
)

echo [1/3] bun install ...
call bun install
if errorlevel 1 goto :err

echo [2/3] prisma generate ...
call bun run db:generate
if errorlevel 1 goto :err

echo [3/3] prisma db push ...
call bun run db:push
if errorlevel 1 goto :err

echo.
echo ============================================
echo  DONE!  Now start the platform:
echo      bun run dev
echo  Then open  http://localhost:3000
echo ============================================
pause
exit /b 0

:err
echo.
echo [ERROR] Setup failed. Copy the LAST 10 lines above and paste them in the chat.
pause
exit /b 1