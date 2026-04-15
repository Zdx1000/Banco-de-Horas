import pandas as pd
import numpy as np
import os
import sys
import time
import hashlib
import secrets
from io import BytesIO
from datetime import datetime, timedelta
from flask import Flask, render_template, request, jsonify, session, send_file
from flask_sqlalchemy import SQLAlchemy # type: ignore
from functools import wraps
import tkinter as tk
from tkinter import ttk
import webbrowser
import threading
from openpyxl.utils import get_column_letter
from sqlalchemy import text as sql_text
from sqlalchemy.exc import IntegrityError

app = Flask(__name__, template_folder='.')


def carregar_ou_criar_secret_key() -> str:
    secret_override = os.getenv('BANCO_HORAS_SECRET_KEY')
    if secret_override:
        return secret_override

    os.makedirs(app.instance_path, exist_ok=True)
    secret_path = os.path.join(app.instance_path, 'flask_secret.key')

    try:
        if os.path.exists(secret_path):
            with open(secret_path, 'r', encoding='utf-8') as arquivo_secret:
                secret = arquivo_secret.read().strip()
                if secret:
                    return secret

        secret = secrets.token_hex(32)
        with open(secret_path, 'w', encoding='utf-8') as arquivo_secret:
            arquivo_secret.write(secret)
        return secret
    except OSError:
        return secrets.token_hex(32)


app.secret_key = carregar_ou_criar_secret_key()
app.permanent_session_lifetime = timedelta(days=7)
app.config['SESSION_COOKIE_HTTPONLY'] = True
app.config['SESSION_COOKIE_SAMESITE'] = 'Lax'
app.config['SESSION_COOKIE_SECURE'] = False

# Configuração do SQLite
os.makedirs(app.instance_path, exist_ok=True)
default_db_path = os.path.join(app.instance_path, 'eventos_ausencia.db').replace(os.sep, '/')
app.config['SQLALCHEMY_DATABASE_URI'] = os.getenv('BANCO_HORAS_DATABASE_URI', f'sqlite:///{default_db_path}')
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


def resolver_caminho_recurso(*partes_relativas: str) -> str:
    """Resolve caminhos para recursos considerando execução empacotada ou não.

    Prioriza, nessa ordem:
      1. Override explícito via variável de ambiente BANCO_HORAS_BASEDIR;
      2. Diretório onde o executável final está (quando congelado);
      3. Diretório temporário do PyInstaller (_MEIPASS), quando presente;
      4. Diretório do arquivo fonte (execução em modo desenvolvimento);
      5. Diretório de trabalho atual como último recurso.
    """

    if partes_relativas and os.path.isabs(partes_relativas[0]):
        return os.path.join(*partes_relativas)

    candidatos = []

    override_base = os.getenv('BANCO_HORAS_BASEDIR')
    if override_base:
        candidatos.append(os.path.join(override_base, *partes_relativas))

    if getattr(sys, 'frozen', False):
        exe_dir = os.path.dirname(sys.executable)
        if exe_dir:
            candidatos.append(os.path.join(exe_dir, *partes_relativas))

        meipass = getattr(sys, '_MEIPASS', '')
        if meipass:
            candidatos.append(os.path.join(meipass, *partes_relativas))
    else:
        script_dir = os.path.dirname(os.path.abspath(__file__))
        candidatos.append(os.path.join(script_dir, *partes_relativas))

    candidatos.append(os.path.join(os.getcwd(), *partes_relativas))

    for caminho in candidatos:
        if caminho and os.path.exists(caminho):
            return caminho

    if candidatos:
        return candidatos[0]

    if partes_relativas:
        return os.path.join(*partes_relativas)

    return os.getcwd()


def _resolver_intervalo_cache_padrao() -> int:
    try:
        valor = int(os.getenv("RELATORIO_CACHE_INTERVAL", "300"))
    except (TypeError, ValueError):
        valor = 300
    return max(30, valor)


def normalizar_para_json(valor):
    """Converte tipos do numpy/pandas em equivalentes compatíveis com JSON."""
    if isinstance(valor, dict):
        return {chave: normalizar_para_json(subvalor) for chave, subvalor in valor.items()}

    if isinstance(valor, list):
        return [normalizar_para_json(item) for item in valor]

    if isinstance(valor, tuple):
        return [normalizar_para_json(item) for item in valor]

    if isinstance(valor, (pd.Series, pd.Index)):
        return [normalizar_para_json(item) for item in valor.tolist()]

    if isinstance(valor, np.ndarray):
        return [normalizar_para_json(item) for item in valor.tolist()]

    if isinstance(valor, np.integer):
        return int(valor)

    if isinstance(valor, np.floating):
        return float(valor)

    if isinstance(valor, np.bool_):
        return bool(valor)

    if isinstance(valor, (pd.Timestamp, datetime)):
        return valor.isoformat()

    if isinstance(valor, pd.Timedelta):
        return valor.total_seconds()

    if valor is pd.NA:
        return None

    try:
        if pd.isna(valor):
            return None
    except TypeError:
        pass

    return valor


RELATORIO_CACHE_LOCK = threading.Lock()
RELATORIO_CACHE = {
    "hash": None,
    "arquivos": [],
    "dados": None,
    "df_top_10": None,
    "df_top_10_receber": None,
    "atualizado_em": None,
    "mes": None,
}

RELATORIO_CACHE_INTERVAL = _resolver_intervalo_cache_padrao()
RELATORIO_CACHE_MONITOR_LOCK = threading.Lock()
RELATORIO_CACHE_MONITOR_STARTED = False


class EventoAusencia(db.Model):
    __tablename__ = 'eventos_ausencia'
    __table_args__ = (
        db.UniqueConstraint('employee_id', 'date', name='uq_eventos_ausencia_employee_date'),
    )
    
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
    try:
        db.create_all()
    except Exception as exc:
        db.session.rollback()
        app.logger.warning("Nao foi possivel validar/criar a estrutura do banco: %s", exc)
    try:
        db.session.execute(
            sql_text(
                "CREATE UNIQUE INDEX IF NOT EXISTS uq_eventos_ausencia_employee_date "
                "ON eventos_ausencia (employee_id, date)"
            )
        )
        db.session.commit()
    except Exception as exc:
        db.session.rollback()
        app.logger.warning("Nao foi possivel garantir o indice unico de eventos: %s", exc)

ADMIN_PASSWORD = os.getenv('BANCO_HORAS_ADMIN_PASSWORD', 'martins@01')

def requires_auth(f):
    """Decorator para proteger rotas que requerem autenticação"""
    @wraps(f)
    def decorated(*args, **kwargs):
        if not session.get('authenticated'):
            return jsonify({'erro': 'Acesso não autorizado', 'redirect': '/'}), 401
        return f(*args, **kwargs)
    return decorated


def converter_para_data_iso(valor, nome_campo='data'):
    if isinstance(valor, datetime):
        return valor.date()
    if hasattr(valor, 'year') and hasattr(valor, 'month') and hasattr(valor, 'day'):
        return valor
    if isinstance(valor, str) and valor.strip():
        return datetime.fromisoformat(valor.strip()).date()
    raise ValueError(f'{nome_campo} invÃ¡lida')


def evento_pertence_quinzena_atual(data_evento, referencia=None):
    referencia_data = referencia or datetime.now().date()

    if data_evento.year != referencia_data.year or data_evento.month != referencia_data.month:
        return False

    if referencia_data.day <= 15:
        return data_evento.day <= 15
    return data_evento.day > 15


def buscar_evento_existente(employee_id, data_evento):
    return (
        EventoAusencia.query
        .filter_by(employee_id=str(employee_id), date=data_evento)
        .order_by(EventoAusencia.created_at.asc())
        .first()
    )


def nome_tipo_ausencia(tipo):
    mapa = {
        'folga': 'Folga',
        'ferias': 'Ferias',
        'atestado': 'Atestado',
        'falta': 'Falta',
    }
    return mapa.get(str(tipo).lower(), str(tipo))


def dataframe_de_objeto_colunar(objeto):
    if isinstance(objeto, list):
        return pd.DataFrame(objeto)

    if not isinstance(objeto, dict) or not objeto:
        return pd.DataFrame()

    tamanho = max((len(valor) for valor in objeto.values() if isinstance(valor, list)), default=0)
    if tamanho == 0:
        return pd.DataFrame([objeto])

    linhas = []
    for indice in range(tamanho):
        linha = {}
        for chave, valor in objeto.items():
            if isinstance(valor, list):
                linha[chave] = valor[indice] if indice < len(valor) else None
            else:
                linha[chave] = valor
        linhas.append(linha)

    return pd.DataFrame(linhas)


def ajustar_largura_planilha(worksheet, dataframe):
    for indice_coluna, nome_coluna in enumerate(dataframe.columns, start=1):
        valores = [str(nome_coluna)]
        if not dataframe.empty:
            valores.extend(
                str(valor)
                for valor in dataframe[nome_coluna].tolist()
                if valor is not None
            )
        largura = min(max((len(valor) for valor in valores), default=10) + 2, 48)
        worksheet.column_dimensions[get_column_letter(indice_coluna)].width = largura


def gerar_arquivo_excel(planilhas, nome_arquivo):
    buffer = BytesIO()

    with pd.ExcelWriter(buffer, engine='openpyxl') as writer:
        for nome_planilha, dataframe in planilhas:
            df = dataframe if isinstance(dataframe, pd.DataFrame) else pd.DataFrame()
            nome_seguro = (nome_planilha or 'Planilha')[:31]
            df.to_excel(writer, sheet_name=nome_seguro, index=False)
            ajustar_largura_planilha(writer.sheets[nome_seguro], df)

    buffer.seek(0)
    return send_file(
        buffer,
        as_attachment=True,
        download_name=nome_arquivo,
        mimetype='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    )


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
            data_evento = converter_para_data_iso(dados_evento['date'])
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
    except IntegrityError:
        db.session.rollback()
        evento_existente = buscar_evento_existente(dados_evento.get('employeeId', ''), data_evento)
        return {
            '_erro': 'duplicado',
            'evento_existente': evento_existente.serialize() if evento_existente else None,
        }
    except Exception as e:
        db.session.rollback()
        print(f"Erro ao salvar evento: {e}")
        return None

## Função de compatibilidade removida: salvar_eventos(eventos)
## Motivo: não há mais chamadas no projeto; persistência é feita por evento via POST /eventos


def listar_arquivos_relatorio(diretorio="Dados"):
    """Retorna metadados dos arquivos de relatório ordenados para verificação de alterações."""
    caminho_dados = resolver_caminho_recurso(diretorio)
    if not os.path.isdir(caminho_dados):
        return []

    arquivos = []
    for nome in os.listdir(caminho_dados):
        if not (nome.startswith('Relatorio_Saldos') and nome.endswith(('.xlsx', '.xls'))):
            continue
        caminho_completo = os.path.join(caminho_dados, nome)
        try:
            stat_info = os.stat(caminho_completo)
        except OSError:
            continue
        arquivos.append((nome, stat_info.st_mtime, stat_info.st_size))

    arquivos.sort()
    return arquivos


def gerar_hash_arquivos(arquivos_info):
    """Gera um hash determinístico com base em nome, mtime e tamanho dos arquivos."""
    if not arquivos_info:
        return None

    digest = hashlib.sha256()
    for nome, mtime, tamanho in arquivos_info:
        digest.update(nome.encode('utf-8', errors='ignore'))
        digest.update(str(mtime).encode('utf-8'))
        digest.update(str(tamanho).encode('utf-8'))
    return digest.hexdigest()


def invalidar_cache_relatorio():
    """Invalida o cache forçando recomputação no próximo acesso."""
    with RELATORIO_CACHE_LOCK:
        RELATORIO_CACHE.update({
            "dados": None,
            "df_top_10": None,
            "df_top_10_receber": None,
            "hash": None,
            "arquivos": [],
            "atualizado_em": None,
            "mes": None,
        })


def atualizar_cache_relatorio(force=False, diretorio="Dados"):
    """Atualiza o cache de relatórios caso haja alterações ou se forçado."""
    arquivos_info = listar_arquivos_relatorio(diretorio)
    arquivos_hash = gerar_hash_arquivos(arquivos_info)
    mes_atual = proximo_mes()

    with RELATORIO_CACHE_LOCK:
        precisa_atualizar = (
            force
            or RELATORIO_CACHE.get("dados") is None
            or RELATORIO_CACHE.get("hash") != arquivos_hash
            or RELATORIO_CACHE.get("mes") != mes_atual
        )

    if not precisa_atualizar:
        with RELATORIO_CACHE_LOCK:
            snapshot = RELATORIO_CACHE.copy()
            snapshot["arquivos"] = list(RELATORIO_CACHE.get("arquivos", []))
        return snapshot

    df_relatorio = load_data(diretorio)
    relatorio = None
    df_top_10 = None
    df_top_10_receber = None

    if not df_relatorio.empty:
        try:
            relatorio, df_top_10, df_top_10_receber = processar_dados(df_relatorio)
        except Exception as exc:
            print(f"Erro ao processar dados do relatório: {exc}")
            relatorio = None
            df_top_10 = None
            df_top_10_receber = None

    with RELATORIO_CACHE_LOCK:
        RELATORIO_CACHE.update({
            "hash": arquivos_hash,
            "arquivos": arquivos_info,
            "dados": relatorio,
            "df_top_10": df_top_10,
            "df_top_10_receber": df_top_10_receber,
            "atualizado_em": datetime.now(),
            "mes": mes_atual,
        })
        snapshot = RELATORIO_CACHE.copy()
        snapshot["arquivos"] = list(RELATORIO_CACHE.get("arquivos", []))

    return snapshot


def obter_relatorio_processado(force=False, diretorio="Dados"):
    """Retorna DataFrames processados utilizando o cache em memória."""
    iniciar_monitoramento_cache()
    snapshot = atualizar_cache_relatorio(force=force, diretorio=diretorio)

    relatorio = snapshot.get("dados")
    df_top_10 = snapshot.get("df_top_10")
    df_top_10_receber = snapshot.get("df_top_10_receber")

    relatorio_copia = relatorio.copy(deep=True) if isinstance(relatorio, pd.DataFrame) else None
    df_top_10_copia = df_top_10.copy(deep=True) if isinstance(df_top_10, pd.DataFrame) else None
    df_top_10_receber_copia = df_top_10_receber.copy(deep=True) if isinstance(df_top_10_receber, pd.DataFrame) else None

    atualizado_em = snapshot.get("atualizado_em")
    metadata = {
        "atualizado_em": atualizado_em.isoformat() if isinstance(atualizado_em, datetime) else None,
        "arquivos": [item[0] for item in snapshot.get("arquivos", [])],
        "hash": snapshot.get("hash"),
        "origem": "cache" if relatorio is not None else "vazio",
        "mes": snapshot.get("mes"),
    }

    return relatorio_copia, df_top_10_copia, df_top_10_receber_copia, metadata


def monitorar_relatorios(intervalo=None, diretorio="Dados"):
    intervalo_monitor = intervalo or RELATORIO_CACHE_INTERVAL
    try:
        intervalo_monitor = max(30, int(intervalo_monitor))
    except (TypeError, ValueError):
        intervalo_monitor = 300

    while True:
        try:
            atualizar_cache_relatorio(force=False, diretorio=diretorio)
        except Exception as exc:
            print(f"Erro no monitor de relatórios: {exc}")
        time.sleep(intervalo_monitor)


def iniciar_monitoramento_cache(intervalo=None):
    global RELATORIO_CACHE_MONITOR_STARTED
    with RELATORIO_CACHE_MONITOR_LOCK:
        if RELATORIO_CACHE_MONITOR_STARTED:
            return
        thread_cache = threading.Thread(
            target=monitorar_relatorios,
            kwargs={"intervalo": intervalo or RELATORIO_CACHE_INTERVAL},
            daemon=True,
            name="RelatorioCacheMonitor",
        )
        thread_cache.start()
        RELATORIO_CACHE_MONITOR_STARTED = True


def proximo_mes():
    """Retorna o rótulo do mês/ano no formato "mmm/AAAA" considerando override do usuário."""
    override = obter_mes_override()
    if override:
        return override
    return calcular_mes_padrao()

def load_data(diretorio="Dados"):
    full_path = resolver_caminho_recurso(diretorio)
    
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

            # Mesma quinzena do dia atual considerando mÃªs/ano correntes
            if evento_pertence_quinzena_atual(data_ev, referencia=hoje):
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


@app.route('/', methods=['GET', 'POST'])
def index():
    if request.method == 'POST':
        app.logger.debug(
            "POST recebido na raiz; user-agent=%s", request.headers.get('User-Agent', 'desconhecido')
        )
        return ('', 204)
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

def montar_resposta_tabelas(force_refresh=False):
    relatorio_df, df_top_10, df_top_10_receber, cache_meta = obter_relatorio_processado(force=force_refresh)
    mes = proximo_mes()

    if not isinstance(relatorio_df, pd.DataFrame):
        colunas_base = [
            "Turno",
            "Matrícula",
            "Colaborador",
            "Cargo",
            "SaldoAtual",
            mes,
            "DIAS P/ COMPENSAR",
            "Carga Horaria",
            "SALARIO A RECEBER",
            "SALARIO ABONADO",
        ]
        relatorio_df = pd.DataFrame(columns=colunas_base)
    else:
        relatorio_df = relatorio_df.copy(deep=True)

    if mes not in relatorio_df.columns:
        relatorio_df[mes] = 0.0

    for coluna_padrao in ["DIAS P/ COMPENSAR", "Carga Horaria", "SALARIO A RECEBER", "SALARIO ABONADO"]:
        if coluna_padrao not in relatorio_df.columns:
            relatorio_df[coluna_padrao] = 0.0

    colunas_numericas = ["SaldoAtual", mes, "DIAS P/ COMPENSAR", "Carga Horaria", "SALARIO A RECEBER", "SALARIO ABONADO"]
    for coluna in colunas_numericas:
        if coluna in relatorio_df.columns:
            relatorio_df[coluna] = pd.to_numeric(relatorio_df[coluna], errors='coerce').fillna(0.0)

    if not isinstance(df_top_10, pd.DataFrame):
        df_top_10 = pd.DataFrame(columns=["Matrícula", "Colaborador", "Cargo", "SaldoAtual"])
    else:
        df_top_10 = df_top_10.copy(deep=True)

    if not isinstance(df_top_10_receber, pd.DataFrame):
        df_top_10_receber = pd.DataFrame(columns=["Matrícula", "Colaborador", "Cargo", mes])
    else:
        df_top_10_receber = df_top_10_receber.copy(deep=True)

    if mes not in df_top_10_receber.columns:
        df_top_10_receber[mes] = 0.0

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
        'Matricula': df_top_10['Matrícula'].astype(str).tolist() if 'Matrícula' in df_top_10 else [],
        'Colaborador': df_top_10['Colaborador'].astype(str).tolist() if 'Colaborador' in df_top_10 else [],
        'Cargo': df_top_10['Cargo'].astype(str).tolist() if 'Cargo' in df_top_10 else [],
        'SaldoAtual': df_top_10['SaldoAtual'].tolist() if 'SaldoAtual' in df_top_10 else []
    }

    top_receber = {
        'Matricula': df_top_10_receber['Matrícula'].astype(str).tolist() if 'Matrícula' in df_top_10_receber else [],
        'Colaborador': df_top_10_receber['Colaborador'].astype(str).tolist() if 'Colaborador' in df_top_10_receber else [],
        'Cargo': df_top_10_receber['Cargo'].astype(str).tolist() if 'Cargo' in df_top_10_receber else [],
        'Horas_totais_a_receber': df_top_10_receber[mes].tolist() if mes in df_top_10_receber else []
    }

    dados_page = {
        'Total_a_receber': relatorio_df["SALARIO A RECEBER"].round(2).sum() if "SALARIO A RECEBER" in relatorio_df else 0.0,
        'Total_abonado': relatorio_df['SALARIO ABONADO'].round(2).sum() if 'SALARIO ABONADO' in relatorio_df else 0.0,
        'Total_de_colaboradores_a_receber': relatorio_df[relatorio_df[mes] > 0]['Colaborador'].nunique() if mes in relatorio_df.columns else 0,
        'Total_de_colaboradores_com_abono': relatorio_df[relatorio_df['SALARIO ABONADO'] > 0]['Colaborador'].nunique() if 'SALARIO ABONADO' in relatorio_df else 0,
        'Cache_atualizado_em': cache_meta.get('atualizado_em'),
        'Cache_origem': cache_meta.get('origem'),
    }

    if {'DIAS P/ COMPENSAR', 'Carga Horaria'}.issubset(relatorio_df.columns):
        relatorio_df["Horas_a_receber"] = relatorio_df["DIAS P/ COMPENSAR"] * relatorio_df["Carga Horaria"]
        relatorio_df["Horas_a_receber"] = relatorio_df["Horas_a_receber"].round(2).astype(float)
    else:
        relatorio_df["Horas_a_receber"] = 0
    
    # Tratar novamente valores NaN após cálculos
    relatorio_df = relatorio_df.fillna('')

    relatorio_geral = relatorio_df.to_dict('records')
    
    list_tabela_3 = ["Turno", "Matrícula", "Colaborador", "Cargo", "Horas_a_receber", "SALARIO A RECEBER", "SALARIO ABONADO"]
    tabela_3_base = relatorio_df[list_tabela_3].to_dict('records') if set(list_tabela_3).issubset(relatorio_df.columns) else []
    
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

    resposta = {
        'top_saldo': top_saldo,
        'top_receber': top_receber,
        'relatorio_geral': relatorio_geral,
        'mes_proximo': mes,
        'dados_da_pagina': dados_page,
        'tabela_3': tabela_3,
        'data_atual': data_hoje,
        'total_ausentes': len(ausencias_hoje),
        'cache_info': cache_meta,
    }

    return normalizar_para_json(resposta)


@app.route('/tabelas')
@requires_auth
def tabelas():
    force_refresh = request.args.get('refresh') == '1'
    return jsonify(montar_resposta_tabelas(force_refresh=force_refresh))


@app.route('/tabelas/exportar', methods=['GET'])
@requires_auth
def exportar_tabelas():
    force_refresh = request.args.get('refresh') == '1'
    payload = montar_resposta_tabelas(force_refresh=force_refresh)
    data_arquivo = datetime.now().date().isoformat()

    planilhas = [
        ('Top_Saldo', dataframe_de_objeto_colunar(payload.get('top_saldo'))),
        ('Top_Receber', dataframe_de_objeto_colunar(payload.get('top_receber'))),
        ('Relatorio_Geral', pd.DataFrame(payload.get('relatorio_geral') or [])),
        ('Tabela_3', pd.DataFrame(payload.get('tabela_3') or [])),
        ('Dados_Pagina', pd.DataFrame([payload.get('dados_da_pagina') or {}])),
        ('Cache_Info', pd.DataFrame([payload.get('cache_info') or {}])),
        (
            'Resumo',
            pd.DataFrame([
                {
                    'mes_proximo': payload.get('mes_proximo'),
                    'data_atual': payload.get('data_atual'),
                    'total_ausentes': payload.get('total_ausentes'),
                }
            ]),
        ),
    ]

    return gerar_arquivo_excel(planilhas, f'banco_horas_dados_{data_arquivo}.xlsx')


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
            invalidar_cache_relatorio()

            return jsonify({'sucesso': True, 'mes': valor_normalizado, 'override': True})

        # Resetar para cálculo automático
        selecionar_mes_override(None)
        invalidar_cache_relatorio()
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


@app.route('/eventos/exportar', methods=['GET'])
@requires_auth
def exportar_eventos():
    inicio = request.args.get('inicio', '').strip()
    fim = request.args.get('fim', '').strip()

    if not inicio or not fim:
        return jsonify({'erro': 'Informe a data inicial e final'}), 400

    try:
        data_inicio = converter_para_data_iso(inicio, 'data inicial')
        data_fim = converter_para_data_iso(fim, 'data final')
    except ValueError as exc:
        return jsonify({'erro': str(exc)}), 400

    if data_inicio > data_fim:
        return jsonify({'erro': 'A data inicial nÃ£o pode ser maior que a final'}), 400

    eventos = (
        EventoAusencia.query
        .filter(EventoAusencia.date >= data_inicio, EventoAusencia.date <= data_fim)
        .order_by(EventoAusencia.date.asc(), EventoAusencia.employee_name.asc(), EventoAusencia.created_at.asc())
        .all()
    )

    if not eventos:
        return jsonify({'erro': 'Nenhum evento encontrado no perÃ­odo selecionado'}), 404

    linhas = [
        {
            'Data': evento.date.isoformat(),
            'Matricula': evento.employee_id,
            'Colaborador': evento.employee_name,
            'Tipo': nome_tipo_ausencia(evento.absence_type),
            'Observacoes': evento.notes or '',
            'CriadoEm': evento.created_at.isoformat(),
            'Origem': evento.source,
        }
        for evento in eventos
    ]

    nome_arquivo = f'eventos_{data_inicio.isoformat()}_a_{data_fim.isoformat()}.xlsx'
    return gerar_arquivo_excel([('Eventos', pd.DataFrame(linhas))], nome_arquivo)

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
        
        data_evento = converter_para_data_iso(dados.get('date'))
        employee_id = str(dados.get('employeeId', '')).strip()
        employee_name = str(dados.get('employeeName', '')).strip()
        absence_type = str(dados.get('absenceType', '')).strip().lower()

        if not employee_id or not employee_name or not absence_type:
            return jsonify({'erro': 'Dados do evento estÃ£o incompletos'}), 400

        evento_existente = buscar_evento_existente(employee_id, data_evento)
        if evento_existente:
            return jsonify({
                'erro': 'JÃ¡ existe um evento para este colaborador nesta data',
                'evento_existente': evento_existente.serialize(),
            }), 409

        novo_evento_data = {
            'id': f"{datetime.now().timestamp()}_{employee_id}",
            'date': data_evento,
            'employeeId': employee_id,
            'employeeName': employee_name,
            'absenceType': absence_type,
            'notes': dados.get('notes', ''),
            'createdAt': datetime.now().isoformat(),
            'source': 'calendar'
        }
        
        evento_salvo = salvar_evento_db(novo_evento_data)
        
        if isinstance(evento_salvo, dict) and evento_salvo.get('_erro') == 'duplicado':
            return jsonify({
                'erro': 'Já existe um evento para este colaborador nesta data',
                'evento_existente': evento_salvo.get('evento_existente'),
            }), 409

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
        data_evento = converter_para_data_iso(data_str)
        
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
    root.geometry("560x740")
    root.resizable(False, False)
    root.configure(bg="#0f172a")

    icon_bitmap_path = None
    for candidato in ["favicon.ico", os.path.join("static", "favicon.ico")]:
        caminho = resolver_caminho_recurso(candidato)
        if not os.path.exists(caminho):
            continue
        try:
            root.iconbitmap(caminho)
            icon_bitmap_path = caminho
            break
        except Exception:
            icon_bitmap_path = caminho
            break

    icon_image = None
    for candidato in [os.path.join("static", "favicon.png"), "favicon.png", icon_bitmap_path]:
        if not candidato:
            continue
        caminho = candidato if os.path.isabs(candidato) else resolver_caminho_recurso(candidato)
        if not os.path.exists(caminho):
            continue
        try:
            icon_image = tk.PhotoImage(file=caminho)
            root.iconphoto(False, icon_image)
            break
        except tk.TclError:
            icon_image = None

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

    title_container = tk.Frame(header_top, bg="#111c3a")
    title_container.pack(side="left", anchor="w")

    if icon_image:
        icon_label = tk.Label(title_container, image=icon_image, bg="#111c3a")
        icon_label.image = icon_image
        icon_label.pack(side="left", padx=(0, 12))
    else:
        icon_label = tk.Label(
            title_container,
            text="📊",
            font=("Segoe UI Emoji", 22),
            bg="#111c3a",
            fg="#38bdf8"
        )
        icon_label.pack(side="left", padx=(0, 12))

    titulo_label = tk.Label(
        title_container,
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
        ("🖥️", "Host", "localhost"),
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

    return root


if __name__ == '__main__':
    # Inicializa o banco de dados
    
    # Criar e exibir interface gráfica
    root = criar_interface_servidor()
    
    # Função para rodar o Flask em thread separada
    def rodar_flask():
        app.run(debug=False, host='127.0.0.1', port=5000, use_reloader=False)
    
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
