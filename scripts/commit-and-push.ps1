param(
  [string]$branch = 'feature/toasts',
  [string]$base = 'dev'
)

if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
  Write-Error "git bulunamadı. Lütfen git yükleyin ve yeniden çalıştırın."
  exit 1
}

$current = git rev-parse --abbrev-ref HEAD
Write-Host "Mevcut branch: $current"

git checkout -b $branch
git add -A
git commit -m "feat: add global toast notifications (variants, animation) and integrate across panels";
git push -u origin $branch
Write-Host "Push tamamlandı. Lütfen GitHub/GitLab üzerinden PR oluşturun (hedef: $base)."
