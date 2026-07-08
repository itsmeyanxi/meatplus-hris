# Meatplus HRIS — Auto-start script
# Launches Laravel backend and Next.js frontend in separate windows on login.

$backendDir  = "C:\xampp\htdocs\meatplus-hris\backend"
$frontendDir = "C:\xampp\htdocs\meatplus-hris\frontend"
$phpExe      = "C:\laragon\bin\php\php-8.3.30-Win32-vs16-x64\php.exe"

# --- Backend (Laravel) ---
Start-Process -FilePath $phpExe `
    -ArgumentList "artisan", "serve", "--host=0.0.0.0", "--port=8000" `
    -WorkingDirectory $backendDir `
    -WindowStyle Normal

# Give the backend a few seconds to bind the port before the frontend starts
Start-Sleep -Seconds 4

# --- Frontend (Next.js) ---
Start-Process -FilePath "cmd.exe" `
    -ArgumentList "/k", "npm run dev -- -p 3001 -H 0.0.0.0" `
    -WorkingDirectory $frontendDir `
    -WindowStyle Normal
