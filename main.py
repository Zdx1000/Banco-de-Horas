import pandas as pd
import os
import sys
from datetime import datetime, timedelta
from flask import Flask, render_template, request, jsonify, session
from flask_sqlalchemy import SQLAlchemy # type: ignore
from functools import wraps
import tkinter as tk
from tkinter import ttk
import webbrowser
import threading

app = Flask(__name__, template_folder='.')
app.secret_key = 'sua_chave_secreta_super_segura_aqui_2024!'
app.permanent_session_lifetime = timedelta(days=7)

# Configuração do SQLite
app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///eventos_ausencia.db'
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
db = SQLAlchemy(app)

MESES_PT = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"]
_mes_override_lock = threading.Lock()
_mes_override_value = None


def selecionar_mes_override(novo_valor):
    global _mes_override_value
    with _mes_override_lock:
        _mes_override_value = novo_valor


def obter_mes_override():
    with _mes_override_lock:
        return _mes_override_value


def calcular_mes_padrao():
    hoje = datetime.now()

    if hoje.day <= 15:
        mes_num = hoje.month
        ano = hoje.year
    else:
        if hoje.month == 12:
            mes_num = 1
            ano = hoje.year + 1
        else:
            mes_num = hoje.month + 1
            ano = hoje.year

    return f"{MESES_PT[mes_num - 1]}/{ano}"

class EventoAusencia(db.Model):
    __tablename__ = 'eventos_ausencia'
    
    id = db.Column(db.String(100), primary_key=True)
    date = db.Column(db.Date, nullable=False, index=True)
    employee_id = db.Column(db.String(50), nullable=False, index=True)
    employee_name = db.Column(db.String(200), nullable=False)
    absence_type = db.Column(db.String(50), nullable=False)
    notes = db.Column(db.Text, default='')
    created_at = db.Column(db.DateTime, nullable=False)
    source = db.Column(db.String(50), default='calendar')
    
    def serialize(self):
        """Retorna dicionário compatível com o formato JSON original"""
        return {
            'id': self.id,
            'date': self.date.isoformat(),
            'employeeId': self.employee_id,
            'employeeName': self.employee_name,
            'absenceType': self.absence_type,
            'notes': self.notes,
            'createdAt': self.created_at.isoformat(),
            'source': self.source
        }

# Criar tabelas no banco de dados
with app.app_context():
    db.create_all()

ADMIN_PASSWORD = 'martins@01'

def requires_auth(f):
    """Decorator para proteger rotas que requerem autenticação"""
    @wraps(f)
    def decorated(*args, **kwargs):
        if not session.get('authenticated'):
            return jsonify({'erro': 'Acesso não autorizado', 'redirect': '/'}), 401
        return f(*args, **kwargs)
    return decorated

def carregar_eventos():
    """Carrega eventos do banco de dados (sem filtro de data, ordenados por data ascendente)"""
    try:
        # Sem filtro para permitir que o front diferencie visualmente eventos passados
        eventos_db = (
            EventoAusencia.query
            .order_by(EventoAusencia.date.asc(), EventoAusencia.created_at.asc())
            .all()
        )
        return [evento.serialize() for evento in eventos_db]
    except Exception as e:
        print(f"Erro ao carregar eventos: {e}")
        return []

def salvar_evento_db(dados_evento):
    """Salva um novo evento no banco de dados"""
    try:
        # Converter string de data para objeto date
        if isinstance(dados_evento.get('date'), str):
            data_evento = datetime.fromisoformat(dados_evento['date']).date()
        else:
            data_evento = dados_evento['date']
        
        # Converter string de created_at para datetime se necessário
        if isinstance(dados_evento.get('createdAt'), str):
            created_at = datetime.fromisoformat(dados_evento['createdAt'].replace('Z', '+00:00'))
        else:
            created_at = dados_evento.get('createdAt', datetime.now())
        
        novo_evento = EventoAusencia(
            id=dados_evento['id'],
            date=data_evento,
            employee_id=str(dados_evento['employeeId']),
            employee_name=dados_evento['employeeName'],
            absence_type=dados_evento['absenceType'],
            notes=dados_evento.get('notes', ''),
            created_at=created_at,
            source=dados_evento.get('source', 'calendar')
        )
        
        db.session.add(novo_evento)
        db.session.commit()
        return novo_evento.serialize()
    except Exception as e:
        db.session.rollback()
        print(f"Erro ao salvar evento: {e}")
        return None

## Função de compatibilidade removida: salvar_eventos(eventos)
## Motivo: não há mais chamadas no projeto; persistência é feita por evento via POST /eventos

def proximo_mes():
    """Retorna o rótulo do mês/ano no formato "mmm/AAAA" considerando override do usuário."""
    override = obter_mes_override()
    if override:
        return override
    return calcular_mes_padrao()

def load_data(diretorio="Dados"):
    # Verifica se está rodando como executável PyInstaller
    if getattr(sys, 'frozen', False):
        # Se estiver rodando como executável, usa o diretório do executável
        script_dir = os.path.dirname(sys.executable)
    else:
        # Se estiver rodando como script Python, usa o diretório do script
        script_dir = os.path.dirname(os.path.abspath(__file__))
    
    full_path = os.path.join(script_dir, diretorio)
    
    # Verifica se o diretório existe
    if not os.path.exists(full_path):
        print(f"Diretório não encontrado: {full_path}")
        return pd.DataFrame()
    
    excel_files = [
        os.path.join(full_path, f) for f in os.listdir(full_path)
        if f.startswith('Relatorio_Saldos') and f.endswith(('.xlsx', '.xls'))]
    if not excel_files:
        print(f"Nenhum arquivo Excel encontrado em: {full_path}")
        return pd.DataFrame()
    dataframes = []
    for file_path in excel_files:
        df = pd.read_excel(file_path)
        dataframes.append(df)
    Relatorio_Saldos = pd.concat(dataframes, axis=0, ignore_index=True)

    return Relatorio_Saldos

def processar_dados(Relatorio_Saldos):
    mes_proximo = proximo_mes()
    Relatorio_Saldos[['Matrícula', 'Colaborador']] = Relatorio_Saldos['Colaborador'] \
        .str.split(' - ', n=1, expand=True)
    
    Relatorio_Saldos['Turno'] = Relatorio_Saldos['Departamento'].str.extract(r'(\dTURNO)')
    # Tratar valores NaN na coluna Turno
    Relatorio_Saldos['Turno'] = Relatorio_Saldos['Turno'].fillna('')

    if mes_proximo not in Relatorio_Saldos.columns:
        Relatorio_Saldos[mes_proximo] = 0

    lista_colunas = ["Turno", "Matrícula","Colaborador", "Cargo", "SaldoAtual", mes_proximo]
    Relatorio_Saldos = Relatorio_Saldos[lista_colunas]

    Relatorio_Saldos["C.HORÁRIA"] = 7.20

    Relatorio_Saldos[mes_proximo] = (
        Relatorio_Saldos[mes_proximo]
        .astype(str)
        .str.replace(":", ".", regex=False)
    ).astype(float)
    Relatorio_Saldos["DIAS P/ COMPENSAR"] = Relatorio_Saldos[mes_proximo] / Relatorio_Saldos["C.HORÁRIA"]
    Relatorio_Saldos["DIAS P/ COMPENSAR"] = Relatorio_Saldos["DIAS P/ COMPENSAR"].round(2)

    salario = {
        "LIDER PRODUCAO": 4077.00,
        "ASSISTENTE LOGISTICA II": 3288.59,
        "ASSISTENTE PRODUCAO": 2683.38,
        "OPERADOR EMPILHADEIRA": 3088.59,
        "OPERADOR MOVIMENTACAO E ARMAZENAGEM III": 2683.38,
        "OPERADOR MOVIMENTACAO E ARMAZENAGEM II": 2081.74,
        "OPERADOR MOVIMENTACAO E ARMAZENAGEM I": 1898.55
    }

    Relatorio_Saldos["Salario"] = Relatorio_Saldos["Cargo"].map(salario).fillna(0)

    Relatorio_Saldos["SaldoAtual"] = Relatorio_Saldos["SaldoAtual"].str.replace(':', '.').astype(float)

    # Otimização: pré-agrupar eventos por matrícula para a quinzena atual (exclui 'ferias')
    eventos = carregar_eventos()
    hoje = datetime.now().date()
    primeira_quinzena = hoje.day <= 15

    counts = {}
    for ev in eventos:
        try:
            # Ignorar férias no cálculo
            if str(ev.get('absenceType', '')).lower() == 'ferias':
                continue

            mat = str(ev.get('employeeId', ''))
            if not mat:
                continue

            data_ev = datetime.fromisoformat(ev.get('date', ''))
            # Se vier sem hora, ok; se vier com hora (ISO), .date() normaliza
            data_ev = data_ev.date() if isinstance(data_ev, datetime) else data_ev

            # Mesma quinzena do dia atual
            if (primeira_quinzena and data_ev.day <= 15) or ((not primeira_quinzena) and data_ev.day > 15):
                counts[mat] = counts.get(mat, 0) + 1
        except Exception:
            # Silenciar registros inválidos para robustez
            continue

    Relatorio_Saldos["QTD_EVENTOS"] = (
        Relatorio_Saldos["Matrícula"].astype(str).map(counts).fillna(0).astype(int)
    )
    Relatorio_Saldos["QTD / DIAS"] = Relatorio_Saldos["QTD_EVENTOS"]
    Relatorio_Saldos["QTD / HORAS"] = Relatorio_Saldos["QTD / DIAS"] * Relatorio_Saldos["C.HORÁRIA"]

    valor_hora_com_bonus = ((Relatorio_Saldos["Salario"] / 220) * 0.9) + (Relatorio_Saldos["Salario"] / 220)
    horas_compensadas = Relatorio_Saldos["QTD / DIAS"] * Relatorio_Saldos["C.HORÁRIA"]
    horas_a_receber = Relatorio_Saldos["DIAS P/ COMPENSAR"] * Relatorio_Saldos["C.HORÁRIA"]

    Relatorio_Saldos["SALARIO ABONADO"] = valor_hora_com_bonus * horas_compensadas
    Relatorio_Saldos["SALARIO A RECEBER"] = (valor_hora_com_bonus * horas_a_receber) - Relatorio_Saldos["SALARIO ABONADO"]
    Relatorio_Saldos["SALARIO A RECEBER"] = Relatorio_Saldos["SALARIO A RECEBER"].round(2).astype(float)

    Relatorio_Saldos = Relatorio_Saldos.rename(columns={
        'C.HORÁRIA': 'Carga Horaria'})

    # Tratar todos os valores NaN no DataFrame para evitar erro de JSON
    Relatorio_Saldos = Relatorio_Saldos.fillna('')

    df_top_10 = Relatorio_Saldos.nlargest(10, 'SaldoAtual').reset_index()
    df_top_10_receber = Relatorio_Saldos.nlargest(10, mes_proximo).reset_index()

    # Tratar NaN nos DataFrames de top 10 também
    df_top_10 = df_top_10.fillna('')
    df_top_10_receber = df_top_10_receber.fillna('')

    return Relatorio_Saldos, df_top_10, df_top_10_receber


@app.route('/')
def index():
    return render_template('index.html')

@app.route('/auth', methods=['POST'])
def authenticate():
    """Endpoint para autenticação"""
    try:
        dados = request.get_json()
        senha = dados.get('password', '')
        
        if senha == ADMIN_PASSWORD:
            session.permanent = True
            session['authenticated'] = True
            return jsonify({'sucesso': True, 'mensagem': 'Autenticado com sucesso'})
        else:
            return jsonify({'sucesso': False, 'mensagem': 'Senha incorreta'}), 401
            
    except Exception as e:
        return jsonify({'sucesso': False, 'mensagem': 'Erro no servidor'}), 500

@app.route('/auth/status', methods=['GET'])
def auth_status():
    """Retorna se o usuário já está autenticado na sessão atual"""
    return jsonify({'authenticated': bool(session.get('authenticated', False))})

@app.route('/tabelas')
@requires_auth
def tabelas():
    mes = proximo_mes()
    Relatorio, df_top_10, df_top_10_receber = processar_dados(load_data())

    eventos = carregar_eventos()
    data_hoje = datetime.now().date().isoformat()

    ausencias_hoje = {}
    for evento in eventos:
        if evento.get('date', '').startswith(data_hoje):
            matricula = evento.get('employeeId', '')
            tipo_ausencia = evento.get('absenceType', '')
            if matricula and tipo_ausencia:
                ausencias_hoje[matricula] = tipo_ausencia

    top_saldo = {
        'Matricula': df_top_10['Matrícula'].astype(str).tolist(),
        'Colaborador': df_top_10['Colaborador'].astype(str).tolist(),
        'Cargo': df_top_10['Cargo'].astype(str).tolist(),
        'SaldoAtual': df_top_10['SaldoAtual'].tolist()
    }

    top_receber = {
        'Matricula': df_top_10_receber['Matrícula'].astype(str).tolist(),
        'Colaborador': df_top_10_receber['Colaborador'].astype(str).tolist(),
        'Cargo': df_top_10_receber['Cargo'].astype(str).tolist(),
        'Horas_totais_a_receber': df_top_10_receber[mes].tolist()
    }

    dados_page = {
        'Total_a_receber': Relatorio["SALARIO A RECEBER"].round(2).sum(),
        'Total_abonado': Relatorio['SALARIO ABONADO'].round(2).sum(),
        'Total_de_colaboradores_a_receber': Relatorio[Relatorio[mes] > 0]['Colaborador'].nunique(),
        'Total_de_colaboradores_com_abono': Relatorio[Relatorio['SALARIO ABONADO'] > 0]['Colaborador'].nunique(),
    }

    relatorio_geral = Relatorio.to_dict('records')

    Relatorio["Horas_a_receber"] = Relatorio["DIAS P/ COMPENSAR"] * Relatorio["Carga Horaria"]
    Relatorio["Horas_a_receber"] = Relatorio["Horas_a_receber"].round(2).astype(float)
    
    # Tratar novamente valores NaN após cálculos
    Relatorio = Relatorio.fillna('')
    
    list_tabela_3 = ["Turno", "Matrícula", "Colaborador", "Cargo", "Horas_a_receber", "SALARIO A RECEBER", "SALARIO ABONADO"]
    tabela_3_base = Relatorio[list_tabela_3].to_dict('records')
    
    tabela_3 = []
    for colaborador in tabela_3_base:
        matricula = str(colaborador['Matrícula'])
        colaborador_info = colaborador.copy()
        
        # Tratar valores NaN individualmente em cada registro
        for key, value in colaborador_info.items():
            if pd.isna(value) or str(value).lower() in ['nan', 'none']:
                colaborador_info[key] = ''
        
        # Verificar se há ausência para hoje
        if matricula in ausencias_hoje:
            colaborador_info['statusAusencia'] = ausencias_hoje[matricula]
            colaborador_info['estaAusente'] = True
        else:
            colaborador_info['statusAusencia'] = ''
            colaborador_info['estaAusente'] = False
            
        tabela_3.append(colaborador_info)

    return jsonify({
        'top_saldo': top_saldo,
        'top_receber': top_receber,
        'relatorio_geral': relatorio_geral,
        'mes_proximo': mes,
        'dados_da_pagina': dados_page,
        'tabela_3': tabela_3,
        'data_atual': data_hoje,
        'total_ausentes': len(ausencias_hoje)
    })


@app.route('/config/mes', methods=['POST'])
@requires_auth
def configurar_mes_referencia():
    """Atualiza ou reseta o mês de referência utilizado em proximo_mes."""
    try:
        dados = request.get_json(silent=True) or {}
        valor_mes = dados.get('mes')

        if valor_mes:
            if not isinstance(valor_mes, str):
                return jsonify({'erro': 'Valor de mês inválido'}), 400

            partes = valor_mes.split('/')
            if len(partes) != 2:
                return jsonify({'erro': 'Formato esperado: mmm/AAAA'}), 400

            mes_part = partes[0].strip().lower()
            ano_part = partes[1].strip()

            if mes_part not in MESES_PT:
                return jsonify({'erro': 'Mês inválido'}), 400

            try:
                ano_int = int(ano_part)
                if ano_int < 1900 or ano_int > 9999:
                    raise ValueError
            except (ValueError, TypeError):
                return jsonify({'erro': 'Ano inválido'}), 400

            valor_normalizado = f"{mes_part}/{ano_int}"
            selecionar_mes_override(valor_normalizado)

            return jsonify({'sucesso': True, 'mes': valor_normalizado, 'override': True})

        # Resetar para cálculo automático
        selecionar_mes_override(None)
        mes_atual = proximo_mes()
        return jsonify({'sucesso': True, 'mes': mes_atual, 'override': False})

    except Exception as e:
        print(f"Erro ao configurar mês de referência: {e}")
        return jsonify({'erro': 'Erro interno ao atualizar mês'}), 500

@app.route('/eventos', methods=['GET'])
@requires_auth
def obter_eventos():
    """Retorna todos os eventos de ausência"""
    eventos = carregar_eventos()
    return jsonify({'eventos': eventos})

@app.route('/eventos', methods=['POST'])
@requires_auth
def salvar_evento():
    """Salva um novo evento de ausência"""
    try:
        dados = request.get_json()
        
        if not dados:
            return jsonify({'erro': 'Dados não fornecidos'}), 400
        
        # Validar campos obrigatórios
        campos_obrigatorios = ['date', 'employeeId', 'employeeName', 'absenceType']
        for campo in campos_obrigatorios:
            if campo not in dados:
                return jsonify({'erro': f'Campo obrigatório: {campo}'}), 400
        
        novo_evento_data = {
            'id': f"{datetime.now().timestamp()}_{dados['employeeId']}",
            'date': dados['date'],
            'employeeId': str(dados['employeeId']),
            'employeeName': dados['employeeName'],
            'absenceType': dados['absenceType'],
            'notes': dados.get('notes', ''),
            'createdAt': datetime.now().isoformat(),
            'source': 'calendar'
        }
        
        evento_salvo = salvar_evento_db(novo_evento_data)
        
        if evento_salvo:
            return jsonify({'sucesso': True, 'evento': evento_salvo})
        else:
            return jsonify({'erro': 'Erro ao salvar evento'}), 500
            
    except Exception as e:
        return jsonify({'erro': str(e)}), 500

@app.route('/eventos/<evento_id>', methods=['DELETE'])
@requires_auth
def excluir_evento(evento_id):
    """Exclui um evento específico"""
    try:
        evento = EventoAusencia.query.filter_by(id=evento_id).first()
        
        if not evento:
            return jsonify({'erro': 'Evento não encontrado'}), 404
        
        db.session.delete(evento)
        db.session.commit()
        
        return jsonify({'sucesso': True})
            
    except Exception as e:
        db.session.rollback()
        return jsonify({'erro': str(e)}), 500

@app.route('/ausencia', methods=['POST'])
@requires_auth
def atualizar_ausencia():
    """Atualiza ausência de um colaborador para uma data específica"""
    try:
        dados = request.get_json()
        matricula = str(dados.get('matricula', ''))
        colaborador = dados.get('colaborador', '')
        tipo_ausencia = dados.get('tipoAusencia', '')
        data_str = dados.get('data', datetime.now().date().isoformat())
        
        if not matricula or not colaborador:
            return jsonify({'erro': 'Matrícula e colaborador são obrigatórios'}), 400
        
        # Converter string para date
        data_evento = datetime.fromisoformat(data_str).date()
        
        # Remover eventos existentes para este colaborador nesta data
        eventos_existentes = EventoAusencia.query.filter_by(
            employee_id=matricula,
            date=data_evento
        ).all()
        
        for evento in eventos_existentes:
            db.session.delete(evento)
        
        # Adicionar novo evento se tipo_ausencia não está vazio
        if tipo_ausencia and tipo_ausencia != "":
            # Mapear tipos de ausência
            tipo_map = {
                'Folga': 'folga',
                'Ferias': 'ferias', 
                'Falta': 'falta',
                'Atestado': 'atestado'
            }
            
            novo_evento = EventoAusencia(
                id=f"{datetime.now().timestamp()}_{matricula}",
                date=data_evento,
                employee_id=matricula,
                employee_name=colaborador,
                absence_type=tipo_map.get(tipo_ausencia, tipo_ausencia.lower()),
                notes='',
                created_at=datetime.now(),
                source='table'
            )
            
            db.session.add(novo_evento)
        
        db.session.commit()
        return jsonify({'sucesso': True})
            
    except Exception as e:
        db.session.rollback()
        return jsonify({'erro': str(e)}), 500


def criar_interface_servidor():
    """Cria uma interface gráfica moderna para mostrar o status do servidor"""
    import time

    inicio_servidor = datetime.now().strftime('%d %b %Y • %H:%M')
    url_dashboard = 'http://localhost:5000'

    def abrir_site():
        """Abre o site no navegador padrão com feedback visual"""
        abrir_btn.configure(text="🔄 Abrindo...")
        root.update_idletasks()
        webbrowser.open(url_dashboard)
        root.after(1500, lambda: abrir_btn.configure(text="🌐 Abrir Dashboard"))

    def fechar_aplicacao():
        """Fecha a aplicação com animação"""
        status_badge.configure(text="OFFLINE", bg="#f97316")
        status_dot.configure(foreground="#f97316")
        status_label.configure(text="Servidor em processo de encerramento...", fg="#fca5a5")
        fechar_btn.configure(text="⏳ Encerrando...")
        root.update_idletasks()
        root.after(1100, lambda: [root.quit(), root.destroy()])

    def animar_status():
        """Anima visualmente o indicador de status"""
        pulse_cores = ["#22c55e", "#4ade80", "#2dd4bf", "#38bdf8"]
        for i, cor in enumerate(pulse_cores):
            root.after(i * 420, lambda c=cor: status_badge.configure(bg=c))
            root.after(i * 420, lambda c=cor: status_dot.configure(foreground=c))
        root.after(2000, animar_status)

    # Criar janela principal
    root = tk.Tk()
    root.title("Controle de Estoque - Gestão de Horas")
    root.geometry("560x1040")
    root.resizable(False, False)
    root.configure(bg="#0f172a")

    # Estilos globais
    style = ttk.Style()
    style.theme_use('clam')
    style.configure('TFrame', background="#0f172a")
    style.configure('TLabel', background="#0f172a", foreground="#e2e8f0", font=("Segoe UI", 11))

    container = tk.Frame(root, bg="#0f172a", padx=28, pady=24)
    container.pack(fill="both", expand=True)

    # Cabeçalho com título e status
    header_card = tk.Frame(
        container,
        bg="#111c3a",
        highlightbackground="#1e2a44",
        highlightthickness=1,
        bd=0,
        padx=24,
        pady=22
    )
    header_card.pack(fill="x", pady=(0, 20))

    header_top = tk.Frame(header_card, bg="#111c3a")
    header_top.pack(fill="x")

    titulo_label = tk.Label(
        header_top,
        text="CDE - Controle de Estoque",
        font=("Segoe UI", 20, "bold"),
        bg="#111c3a",
        fg="#f8fafc"
    )
    titulo_label.pack(side="left", anchor="w")

    status_badge = tk.Label(
        header_top,
        text="ONLINE",
        font=("Segoe UI", 10, "bold"),
        bg="#22c55e",
        fg="#0f172a",
        padx=14,
        pady=4
    )
    status_badge.pack(side="right", anchor="e")

    subtitulo_label = tk.Label(
        header_card,
        text="Servidor disponível e pronto para o dashboard operacional.",
        font=("Segoe UI", 11),
        bg="#111c3a",
        fg="#93c5fd"
    )
    subtitulo_label.pack(anchor="w", pady=(14, 6))

    status_row = tk.Frame(header_card, bg="#111c3a")
    status_row.pack(fill="x")

    status_dot = tk.Label(status_row, text="●", font=("Segoe UI", 16), bg="#111c3a", fg="#22c55e")
    status_dot.pack(side="left")

    status_label = tk.Label(
        status_row,
        text="Monitorando requisições em tempo real.",
        font=("Segoe UI", 10),
        bg="#111c3a",
        fg="#cbd5f5"
    )
    status_label.pack(side="left", padx=(8, 0))

    # Cartões de métricas básicas
    stats_grid = tk.Frame(container, bg="#0f172a")
    stats_grid.pack(fill="x")

    stats = [
        ("🟢", "Status atual", "Ativo e seguro"),
        ("🕒", "Iniciado em", inicio_servidor),
        ("🖥️", "Host", "0.0.0.0"),
        ("🔌", "Porta", "5000")
    ]

    for index, (icon, title, value) in enumerate(stats):
        card = tk.Frame(
            stats_grid,
            bg="#111c3a",
            highlightbackground="#1e2a44",
            highlightthickness=1,
            bd=0,
            padx=22,
            pady=18
        )
        row = index // 2
        col = index % 2
        card.grid(row=row, column=col, padx=10, pady=10, sticky="nsew")
        stats_grid.columnconfigure(col, weight=1)
        stats_grid.rowconfigure(row, weight=1)

        icon_label = tk.Label(card, text=icon, font=("Segoe UI Emoji", 26), bg="#111c3a", fg="#38bdf8")
        icon_label.pack(anchor="w")

        title_label = tk.Label(card, text=title, font=("Segoe UI", 11, "bold"), bg="#111c3a", fg="#e2e8f0")
        title_label.pack(anchor="w", pady=(8, 0))

        value_label = tk.Label(card, text=value, font=("Consolas", 11), bg="#111c3a", fg="#94a3b8")
        value_label.pack(anchor="w")

    separator = tk.Frame(container, bg="#1e293b", height=1)
    separator.pack(fill="x", pady=18)

    # Ações principais
    actions_card = tk.Frame(
        container,
        bg="#111c3a",
        highlightbackground="#1e2a44",
        highlightthickness=1,
        bd=0,
        padx=26,
        pady=24
    )
    actions_card.pack(fill="x")

    actions_title = tk.Label(actions_card, text="Ações rápidas", font=("Segoe UI", 14, "bold"), bg="#111c3a", fg="#f8fafc")
    actions_title.pack(anchor="w")

    actions_desc = tk.Label(
        actions_card,
        text="Controle o dashboard sem sair desta janela. Abra a interface web ou finalize o servidor com segurança.",
        font=("Segoe UI", 10),
        bg="#111c3a",
        fg="#9ca3af",
        wraplength=440,
        justify="left"
    )
    actions_desc.pack(anchor="w", pady=(6, 18))

    button_frame = tk.Frame(actions_card, bg="#111c3a")
    button_frame.pack(fill="x")

    abrir_btn = tk.Button(
        button_frame,
        text="🌐 Abrir Dashboard",
        command=abrir_site,
        font=("Segoe UI", 12, "bold"),
        bg="#38bdf8",
        fg="#0f172a",
        activebackground="#0ea5e9",
        activeforeground="#0f172a",
        relief="flat",
        bd=0,
        padx=26,
        pady=12,
        cursor="hand2"
    )
    abrir_btn.pack(side="left", padx=(0, 14))

    fechar_btn = tk.Button(
        button_frame,
        text="❌ Fechar Servidor",
        command=fechar_aplicacao,
        font=("Segoe UI", 12, "bold"),
        bg="#f87171",
        fg="#0f172a",
        activebackground="#ef4444",
        activeforeground="#0f172a",
        relief="flat",
        bd=0,
        padx=26,
        pady=12,
        cursor="hand2"
    )
    fechar_btn.pack(side="right")

    # Efeitos hover nos botões
    def on_enter_btn(widget, color):
        widget.configure(bg=color)

    def on_leave_btn(widget, color):
        widget.configure(bg=color)

    abrir_btn.bind("<Enter>", lambda e: on_enter_btn(abrir_btn, "#0ea5e9"))
    abrir_btn.bind("<Leave>", lambda e: on_leave_btn(abrir_btn, "#38bdf8"))
    fechar_btn.bind("<Enter>", lambda e: on_enter_btn(fechar_btn, "#ef4444"))
    fechar_btn.bind("<Leave>", lambda e: on_leave_btn(fechar_btn, "#f87171"))

    # Barra de URL
    link_section = tk.Frame(actions_card, bg="#111c3a")
    link_section.pack(fill="x", pady=(20, 0))

    url_caption = tk.Label(link_section, text="URL do dashboard", font=("Segoe UI", 9), bg="#111c3a", fg="#94a3b8")
    url_caption.pack(anchor="w")

    url_label = tk.Label(
        link_section,
        text=url_dashboard,
        font=("Consolas", 11, "bold"),
        bg="#111c3a",
        fg="#38bdf8",
        cursor="hand2"
    )
    url_label.pack(anchor="w", pady=(2, 0))
    url_label.bind("<Button-1>", lambda e: abrir_site())

    footer_label = tk.Label(
        container,
        text="💡 Dica: mantenha esta janela visível para acompanhar o status do servidor.",
        font=("Segoe UI", 9),
        bg="#0f172a",
        fg="#64748b"
    )
    footer_label.pack(anchor="center", pady=(18, 0))

    # Centralizar janela na tela
    root.update_idletasks()
    width = root.winfo_width()
    height = root.winfo_height()
    x = (root.winfo_screenwidth() // 2) - (width // 2)
    y = (root.winfo_screenheight() // 2) - (height // 2)
    root.geometry(f'{width}x{height}+{x}+{y}')

    # Iniciar animação do status
    root.after(1000, animar_status)

    # Ícone da janela (se disponível)
    try:
        root.iconbitmap("favicon.ico")
    except Exception:
        pass

    return root


if __name__ == '__main__':
    # Inicializa o banco de dados
    
    # Criar e exibir interface gráfica
    root = criar_interface_servidor()
    
    # Função para rodar o Flask em thread separada
    def rodar_flask():
        app.run(debug=False, host='0.0.0.0', port=5000, use_reloader=False)
    
    # Iniciar servidor Flask em thread separada
    flask_thread = threading.Thread(target=rodar_flask, daemon=True)
    flask_thread.start()
    
    # Iniciar interface gráfica (loop principal)
    try:
        root.mainloop()
    except KeyboardInterrupt:
        print("Servidor interrompido pelo usuário")
    finally:
        print("Encerrando servidor...")
