# Run after: gh auth login --web --git-protocol https
$ErrorActionPreference = "Stop"
$env:Path = "C:\Program Files\Git\bin;C:\Program Files\GitHub CLI;" + $env:Path
Set-Location "C:\Users\Asus\payment-modulator"

gh auth status
if ($LASTEXITCODE -ne 0) {
  Write-Host "Not logged in. Run: gh auth login --web --git-protocol https"
  exit 1
}

$repoName = "payment-modulator"
$existing = gh repo view $repoName 2>$null
if ($LASTEXITCODE -ne 0) {
  gh repo create $repoName --public --source=. --remote=origin --push
} else {
  if (-not (git remote get-url origin 2>$null)) {
    $user = gh api user -q .login
    git remote add origin "https://github.com/$user/$repoName.git"
  }
  git push -u origin main
}

$user = gh api user -q .login
gh api "repos/$user/$repoName/pages" -X POST -f build_type=legacy -f "source[branch]=main" -f "source[path]=/" 2>$null
Start-Sleep -Seconds 3
Write-Host ""
Write-Host "Share this link with friends:"
Write-Host "https://$user.github.io/$repoName/"
