# Banco de Horas

Aplicação web (Flask) com interface de calendário e relatórios para gestão de banco de horas, ausências e exportação por período. Backend em Python com SQLite (via SQLAlchemy) e frontend em HTML/CSS/JS.

## Visão geral

- Backend: Flask + SQLAlchemy (SQLite) e Pandas para processamento dos relatórios.
- Frontend: HTML estático (`index.html`) e JS em `static/`.
- Armazenamento de eventos de ausência no arquivo SQLite `eventos_ausencia.db` (criado automaticamente).
- Importa relatórios a partir de planilhas em `Dados/Relatorio_Saldos*.xlsx` ou `.xls`.
- Regras de negócio:
  - Um evento por pessoa por dia (evita conflitos).
  - Criação multi-dias para Atestado/Folga (1 a 30 dias) e Férias.
  - Regra do mês/quinzena (exibição de coluna): dia 1–15 usa mês atual; dia >15 usa próximo mês.
  - Otimização de contagem de eventos O(E+R) para performance.
- Exportação: botão "Exportar" na UI permite exportar eventos filtrados por período para Excel.

## Requisitos

- Windows 10/11
- Python 3.11 ou 3.12
- Acesso à internet somente para abrir no navegador local (não é necessário baixar libs em runtime)

## Instalação (PowerShell)

1. (Opcional) Crie um ambiente virtual:

```powershell
python -m venv .venv ; .\.venv\Scripts\Activate.ps1
```

2. Instale as dependências:

```powershell
pip install -r requirements.txt
```

## Estrutura esperada

```
Banco de horas/
├─ main.py
├─ index.html
├─ static/ (js, css)
├─ Dados/
│  └─ Relatorio_Saldos*.xlsx  # um ou mais arquivos que iniciem com esse prefixo
└─ eventos_ausencia.db        # criado automaticamente no primeiro uso
```

Observações:
- A pasta `Dados` deve existir e conter pelo menos um arquivo iniciando com `Relatorio_Saldos` no nome. Formatos aceitos: `.xlsx` (openpyxl) e `.xls` (xlrd 1.2.0).

## Como executar

Execute o servidor Flask (com a interface de controle em Tkinter) com:

```powershell
python .\main.py
```

- A interface abrirá uma janela com o status do servidor e um botão "Abrir Dashboard".
- O dashboard ficará disponível em: http://localhost:5000
- Autenticação: a senha de administrador padrão é `martins@01`.

## Uso rápido

- Calendário: registre ausências (Folga, Atestado, Férias, Falta). O sistema impede mais de um evento por pessoa no mesmo dia e suporta criação em múltiplos dias (até 30) quando aplicável.
- Relatórios: as tabelas exibem saldos e indicadores por colaborador. A coluna do mês segue a regra 1–15 mês atual; >15 próximo mês.
- Mês de referência: em "Alimentar Dados" ajuste o mês (jan–dez). A mudança recarrega o dashboard e atualiza todos os cálculos.
- Exportar: em "Alimentar Dados" escolha "Exportar", selecione período inicial e final, e exporte para Excel os eventos do período.

## Notas técnicas

- Banco de dados: SQLite via SQLAlchemy. Tabela `eventos_ausencia` é criada automaticamente.
- Modelo `EventoAusencia` preserva o formato JSON esperado no frontend (serialize()).
- Processamento de dados: `processar_dados()` usa Pandas e evita `NaN` no JSON retornado.
- Desempenho: contagem de eventos por quinzena é feita por pré-agregação para reduzir custo.
- Logs: `console.log` no frontend está silenciado por padrão; erros continuam visíveis.

## Empacotamento opcional (PyInstaller)

Caso deseje gerar um executável Windows:

```powershell
pip install pyinstaller
pyinstaller --noconfirm --onefile --add-data "index.html;." --add-data "static;static" --add-data "favicon.ico;." --add-data "Dados;Dados" main.py
```

- Ajuste caminhos de `--add-data` conforme necessário.
- Ao rodar empacotado, a aplicação usa os diretórios relativos ao executável.

## Solução de problemas

- "Nenhum arquivo Excel encontrado": verifique se a pasta `Dados` existe e contém arquivos com prefixo `Relatorio_Saldos`.
- Erro ao ler `.xls`: garanta `xlrd==1.2.0` instalado (versões mais novas não suportam xls clássico).
- Porta ocupada: mude a porta em `app.run(..., port=5000)` no `main.py`.
- Problemas com Tkinter: no Windows, o Python oficial já inclui o Tk. Se usar distribuição minimalista, instale o suporte ao Tk.

## Licença

Uso interno. Ajuste conforme a política da sua organização.
