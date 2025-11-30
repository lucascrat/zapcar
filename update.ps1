# Script de Atualizacao Automatica do App ZapCar
# Este script sincroniza o codigo local com o repositorio GitHub

Write-Host "Iniciando atualizacao do app ZapCar..." -ForegroundColor Cyan

# Verificar se estamos em um repositorio Git
if (-not (Test-Path ".git")) {
    Write-Host "Erro: Este diretorio nao e um repositorio Git!" -ForegroundColor Red
    exit 1
}

# Salvar alteracoes locais (se houver)
Write-Host "Salvando alteracoes locais..." -ForegroundColor Yellow
git add .
$hasChanges = git status --porcelain
if ($hasChanges) {
    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    git commit -m "Auto-save: $timestamp" -q
    Write-Host "Alteracoes locais salvas" -ForegroundColor Green
}
else {
    Write-Host "Nenhuma alteracao local para salvar" -ForegroundColor Gray
}

# Buscar atualizacoes do GitHub
Write-Host "Buscando atualizacoes do GitHub..." -ForegroundColor Yellow
git fetch origin

# Verificar se ha atualizacoes disponiveis
$LOCAL = git rev-parse HEAD
$REMOTE = git rev-parse origin/main
$BASE = git merge-base HEAD origin/main

if ($LOCAL -eq $REMOTE) {
    Write-Host "App ja esta atualizado!" -ForegroundColor Green
}
elseif ($LOCAL -eq $BASE) {
    Write-Host "Novas atualizacoes disponiveis. Baixando..." -ForegroundColor Yellow
    
    # Fazer pull das atualizacoes
    git pull origin main --rebase
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host "Codigo atualizado com sucesso!" -ForegroundColor Green
        
        # Instalar/atualizar dependencias
        Write-Host "Atualizando dependencias..." -ForegroundColor Yellow
        npm install
        
        # Build do projeto
        Write-Host "Compilando projeto..." -ForegroundColor Yellow
        npm run build
        
        Write-Host "App atualizado e pronto para uso!" -ForegroundColor Green
        Write-Host "Execute 'npm run dev' para testar" -ForegroundColor Cyan
    }
    else {
        Write-Host "Erro ao atualizar. Verifique conflitos de merge." -ForegroundColor Red
        exit 1
    }
}
elseif ($REMOTE -eq $BASE) {
    Write-Host "Voce tem commits locais nao enviados ao GitHub" -ForegroundColor Yellow
    Write-Host "Execute 'git push origin main' para enviar suas alteracoes" -ForegroundColor Cyan
}
else {
    Write-Host "Divergencia detectada entre local e remoto" -ForegroundColor Yellow
    Write-Host "Resolva manualmente ou use 'git pull --rebase'" -ForegroundColor Cyan
}

Write-Host ""
Write-Host "Processo concluido!" -ForegroundColor Green
