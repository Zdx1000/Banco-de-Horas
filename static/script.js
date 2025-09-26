// Toggle global de logs de debug (idempotente) — por padrão, desabilita console.log
(function(){
  if (typeof window === 'undefined' || typeof console === 'undefined') return;
  if (window.__logToggleInit) return; // evita reinicializar
  window.__logToggleInit = true;

  try {
    if (!console.__origLog && typeof console.log === 'function') {
      console.__origLog = console.log.bind(console);
    }
    window.enableDebugLogs = function(){
      if (console.__origLog) console.log = console.__origLog;
      console.__silenced = false;
      window.DEBUG = true;
    };
    window.disableDebugLogs = function(){
      console.log = function(){};
      console.__silenced = true;
      window.DEBUG = false;
    };
    // desabilita por padrão
    window.disableDebugLogs();
  } catch(_) {}
})();

// Variável global para armazenar dados da API tabela_3
let tabela3Data = null;

// Variáveis globais para o calendário
let currentCalendarDate = new Date();
let selectedDate = null;
let calendarEvents = []; // Agora será carregado do servidor

const MESES_REFERENCIA = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
let mesOverrideRequestInProgress = false;

function obterMesAtualAbreviado() {
  if (typeof window.currentMesProximo !== 'string') return null;
  const partes = window.currentMesProximo.split('/');
  if (!partes.length) return null;
  const mes = partes[0]?.trim().toLowerCase();
  return MESES_REFERENCIA.includes(mes) ? mes : null;
}

function obterAnoReferenciaAtual() {
  if (typeof window.currentMesProximo === 'string') {
    const partes = window.currentMesProximo.split('/');
    if (partes.length >= 2) {
      const ano = partes[1].trim();
      if (/^\d{4}$/.test(ano)) {
        return ano;
      }
    }
  }
  return String(new Date().getFullYear());
}

function syncMesOverrideSelect() {
  const select = document.getElementById('mesOverrideSelect');
  if (!select) return;

  if (!select.dataset.initialized) {
    select.innerHTML = '';
    MESES_REFERENCIA.forEach(mes => {
      const option = document.createElement('option');
      option.value = mes;
      option.textContent = mes.toUpperCase();
      select.appendChild(option);
    });
    select.dataset.initialized = 'true';
    select.addEventListener('change', handleMesOverrideChange);
  }

  const mesAtual = obterMesAtualAbreviado();
  if (mesAtual) {
    select.value = mesAtual;
    select.dataset.selectedValue = mesAtual;
    select.disabled = false;
  } else {
    const fallback = MESES_REFERENCIA[new Date().getMonth()];
    select.value = fallback;
    select.disabled = true;
  }

  const hint = document.getElementById('mesOverrideHint');
  if (hint) {
    if (typeof window.currentMesProximo === 'string') {
      hint.textContent = `Mês atual: ${window.currentMesProximo.toUpperCase()} • Alterar recarrega o dashboard.`;
    } else {
      hint.textContent = 'Carregando mês atual...';
    }
  }
}

async function handleMesOverrideChange(event) {
  if (mesOverrideRequestInProgress) {
    event.preventDefault();
    return;
  }

  const select = event.target;
  const novoMes = (select.value || '').toLowerCase();
  const mesAtual = obterMesAtualAbreviado();

  if (!novoMes || novoMes === mesAtual) {
    if (mesAtual) select.value = mesAtual;
    return;
  }

  const anoReferencia = obterAnoReferenciaAtual();
  const payload = { mes: `${novoMes}/${anoReferencia}` };
  const valorAnterior = mesAtual || select.dataset.selectedValue || novoMes;

  try {
    mesOverrideRequestInProgress = true;
    select.disabled = true;
    select.classList.add('loading');

    const response = await fetch('/config/mes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(payload)
    });

    let resultado = {};
    try {
      resultado = await response.json();
    } catch (_) {
      resultado = {};
    }

    const sucesso = resultado && resultado.sucesso;
    if (!response.ok || !sucesso) {
      const mensagem = (resultado && resultado.erro) || `Falha ao atualizar mês (status ${response.status})`;
      throw new Error(mensagem);
    }

    window.currentMesProximo = resultado.mes;
    select.dataset.selectedValue = novoMes;
    location.reload();
  } catch (error) {
    console.error('Erro ao atualizar mês de referência:', error);
    alert('Não foi possível atualizar o mês. Tente novamente.');
    select.value = mesAtual || valorAnterior;
  } finally {
    mesOverrideRequestInProgress = false;
    select.disabled = false;
    select.classList.remove('loading');
  }
}

window.syncMesOverrideSelect = syncMesOverrideSelect;

// Função para carregar dados da API
async function carregarDadosAPI() {
  try {
    console.log('🚀 Iniciando carregamento dos dados da API...');
    const response = await fetch('/tabelas', {
      method: 'GET',
      credentials: 'include'
    });
    console.log('📡 Resposta da API recebida:', response.status, response.statusText);
    
    if (!response.ok) {
      throw new Error(`Erro HTTP: ${response.status} - ${response.statusText}`);
    }
    
    const data = await response.json();
    console.log('📋 Dados completos da API:', data);
    console.log('📊 Estrutura da resposta:', Object.keys(data));

    if (data.mes_proximo) {
      window.currentMesProximo = data.mes_proximo;
      syncMesOverrideSelect();
    }
    
    // Verificar se tabela_3 existe na resposta
    if (data.tabela_3) {
      console.log('✅ tabela_3 encontrada na resposta');
      console.log('📋 Tipo da tabela_3:', typeof data.tabela_3);
      console.log('📋 É array?', Array.isArray(data.tabela_3));
      console.log('📋 Tamanho/propriedades:', Array.isArray(data.tabela_3) ? data.tabela_3.length : Object.keys(data.tabela_3).length);
      
      // Armazenar dados da tabela_3 globalmente
      tabela3Data = data.tabela_3;
      console.log('💾 Dados da tabela_3 armazenados globalmente:', tabela3Data);
    } else {
      console.warn('⚠️ tabela_3 não encontrada na resposta da API');
      console.log('📋 Propriedades disponíveis:', Object.keys(data));
      tabela3Data = null;
    }
    
    // Carregar eventos do servidor
    console.log('🔄 Iniciando carregamento de eventos...');
    await loadEventsFromServer();
    console.log('✅ Carregamento de eventos concluído');
    console.log('📊 calendarEvents após await:', calendarEvents ? calendarEvents.length : 'undefined');
    
    // Atualizar os cards com os dados da API
    atualizarCards(data.dados_da_pagina);
    
    // Atualizar as tabelas com os dados da API
    atualizarTabelas(data);
    
    // Renderizar calendário com eventos carregados
    setTimeout(() => {
      if (typeof renderCalendar === 'function') {
        console.log('🔄 Renderizando calendário com eventos carregados...');
        renderCalendar();
      }
    }, 100);
    
    // Atualizar ausências após carregar dados e eventos
    setTimeout(() => {
      // ✅ DESABILITADO TEMPORARIAMENTE para não interferir no carregamento inicial
      // if (typeof refreshTableAbsencesFromCalendar === 'function') {
      //   refreshTableAbsencesFromCalendar();
      // }
      
      // Garantir que as ausências sejam aplicadas na tabela
      if (data.tabela_3) {
        console.log('🔄 Aplicando ausências na tabela após carregamento...');
        atualizarAusenciasNaTabela(data.tabela_3);
      }
    }, 500);
    
    console.log('✅ Dados carregados da API com sucesso');
  } catch (error) {
    console.error('❌ Erro ao carregar dados da API:', error);
    console.log('🔄 Tentando novamente em 3 segundos...');
    
    // Tentar novamente após 3 segundos
    setTimeout(() => {
      console.log('🔄 Segunda tentativa de carregamento...');
      carregarDadosAPI();
    }, 3000);
  }
}

// Função para verificar se os dados estão carregados
function verificarDadosCarregados() {
  const status = {
    tabela3Data: tabela3Data !== null,
    tipoTabela3: typeof tabela3Data,
    isArray: Array.isArray(tabela3Data),
    tamanho: tabela3Data ? (Array.isArray(tabela3Data) ? tabela3Data.length : Object.keys(tabela3Data).length) : 0,
    eventos: calendarEvents ? calendarEvents.length : 0
  };
  
  console.log('📊 Status dos dados carregados:', status);
  return status;
}

// Função global para sincronizar dados entre scripts
window.syncTabela3Data = function(data) {
  console.log('🔄 Sincronizando dados da tabela_3 via window.syncTabela3Data...', data);
  tabela3Data = data;
  console.log('✅ tabela3Data atualizada globalmente:', tabela3Data);
  
  // Verificar se há elementos esperando pelos dados
  const event = new CustomEvent('tabela3DataLoaded', { detail: data });
  window.dispatchEvent(event);
};

// Função para atualizar os cards com os dados da API
function atualizarCards(dadosPagina) {
  document.getElementById("Total_a_receber").innerText =
    dadosPagina.Total_a_receber.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  document.getElementById("Total_de_Abono").innerText =
    dadosPagina.Total_abonado.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  document.getElementById("Total_de_colaboradores_a_receber").innerText = dadosPagina.Total_de_colaboradores_a_receber;
  document.getElementById("Total_de_colaboradores_com_abono").innerText = dadosPagina.Total_de_colaboradores_com_abono;
}

// Função para atualizar as tabelas com os dados da API
function atualizarTabelas(data) {
  // Aqui você pode adicionar a lógica para atualizar as tabelas
  // com os dados de top_saldo, top_receber e relatorio_geral
  console.log('📊 Dados recebidos no script.js:', data);
  
  // Sincronizar dados da tabela_3 se não estiverem disponíveis
  if (!tabela3Data && data.tabela_3) {
    console.log('🔄 Sincronizando dados da tabela_3 no script.js...');
    tabela3Data = data.tabela_3;
    console.log('✅ Dados da tabela_3 sincronizados:', tabela3Data);
  }
  
  // Processar informações de ausência se disponíveis
  if (data.data_atual) {
    console.log(`📅 Data atual do servidor: ${data.data_atual}`);
  }
  
  if (data.total_ausentes !== undefined) {
    console.log(`👥 Total de colaboradores ausentes hoje: ${data.total_ausentes}`);
    
    // Atualizar indicador visual se existir
    const ausentesIndicator = document.getElementById('ausentes-hoje');
    if (ausentesIndicator) {
      ausentesIndicator.textContent = data.total_ausentes;
    }
  }
  
  // Log detalhado dos colaboradores ausentes
  if (data.tabela_3 && Array.isArray(data.tabela_3)) {
    const ausentes = data.tabela_3.filter(colaborador => colaborador.estaAusente);
    if (ausentes.length > 0) {
      console.log('👥 Detalhes dos colaboradores ausentes:', ausentes.map(col => ({
        matricula: col.Matrícula,
        nome: col.Colaborador,
        tipo: col.statusAusencia
      })));
    }
    
    // Atualizar a tabela visual com as informações de ausência
    atualizarAusenciasNaTabela(data.tabela_3);
  }
  
  // Chamar sincronização via window se api-loader.js estiver presente
  if (window.syncTabela3Data) {
    window.syncTabela3Data(data.tabela_3);
  }
}

// Função para atualizar ausências na tabela visual
function atualizarAusenciasNaTabela(dadosTabela3) {
  console.log('🔄 Atualizando ausências na tabela visual...');
  
  dadosTabela3.forEach(colaborador => {
    const matricula = colaborador.Matrícula;
    
    // Encontrar o select de ausência para este colaborador
    const selectAusencia = document.querySelector(`select[data-matricula="${matricula}"]`);
    
    if (selectAusencia) {
      // Se há ausência, definir o valor correto
      if (colaborador.estaAusente && colaborador.statusAusencia) {
        // Mapear tipos de ausência para os valores do select
        const tipoMap = {
          'folga': 'Folga',
          'ferias': 'Ferias',
          'atestado': 'Atestado',
          'falta': 'Falta'
        };
        
        const valorSelect = tipoMap[colaborador.statusAusencia] || colaborador.statusAusencia;
        selectAusencia.value = valorSelect;
        
        console.log(`✅ Ausência definida para ${matricula} - ${colaborador.Colaborador}: ${valorSelect}`);
      } else {
        // Se não há ausência, deixar vazio
        selectAusencia.value = '';
      }
    }
  });
  
  console.log('✅ Atualização de ausências na tabela concluída');
}

// Função auxiliar para obter dados da tabela_3 (somente API)
function getTabela3Data() {
  console.log('🔍 Verificando tabela3Data:', {
    tipo: typeof tabela3Data,
    isNull: tabela3Data === null,
    isUndefined: tabela3Data === undefined,
    isArray: Array.isArray(tabela3Data),
    length: tabela3Data ? (Array.isArray(tabela3Data) ? tabela3Data.length : Object.keys(tabela3Data).length) : 0,
    valor: tabela3Data
  });
  
  // Verificar se tabela3Data é null ou undefined
  if (tabela3Data === null || tabela3Data === undefined) {
    console.warn('⚠️ tabela3Data é null ou undefined - dados não foram carregados da API');
    console.log('🔄 Tentando recarregar dados...');
    carregarDadosAPI();
    return [];
  }
  
  if (tabela3Data) {
    // Se é array e tem elementos
    if (Array.isArray(tabela3Data) && tabela3Data.length > 0) {
      console.log('✅ Retornando dados como array com', tabela3Data.length, 'elementos');
      return tabela3Data;
    }
    // Se é array mas está vazio
    else if (Array.isArray(tabela3Data) && tabela3Data.length === 0) {
      console.warn('⚠️ tabela3Data é um array vazio');
      return [];
    }
    // Se é objeto e tem propriedades
    else if (typeof tabela3Data === 'object' && Object.keys(tabela3Data).length > 0) {
      console.log('✅ Retornando dados como objeto com', Object.keys(tabela3Data).length, 'propriedades');
      return tabela3Data;
    }
  }
  
  console.warn('⚠️ Dados da API tabela_3 não estão disponíveis ou estão vazios');
  return [];
}

function carregarDadosSalvos() {
  // Sistema de ausencias agora é gerenciado exclusivamente pelo calendário
  // Esta função é mantida para compatibilidade mas não modifica mais os dados
  console.log('ausencias agora são controladas exclusivamente pelo calendário');
}

// Função para salvar dados no servidor (substitui o antigo localStorage)
function salvarDadosAusencias() {
  try {
    // As ausências agora são controladas exclusivamente pelo servidor
    console.log('✅ Ausências são gerenciadas pelo servidor - dados persistidos automaticamente');
  } catch (error) {
    console.error('Erro ao processar dados:', error);
  }
}

// Função para resetar dados salvos
function resetarDadosSalvos() {
  if (confirm('Tem certeza que deseja recarregar os dados do servidor? Esta ação irá atualizar todas as informações.')) {
    // Recarregar dados do servidor
    carregarDadosAPI();
    
    if (confirm('Deseja recarregar a página para garantir que todas as alterações sejam aplicadas?')) {
      location.reload();
    }
  }
}


function exportarDadosAtuais() {
  try {
    // Buscar dados da API
    fetch('/tabelas', {
      method: 'GET',
      credentials: 'include'
    })
      .then(response => response.json())
      .then(data => {
        // Criar nova workbook
        const wb = XLSX.utils.book_new();

        // Função para aplicar estilos à planilha
        const applySheetStyles = (ws) => {
          if (!ws || !ws['!ref']) return;
          
          const range = XLSX.utils.decode_range(ws['!ref']);
          
          for (let R = range.s.r; R <= range.e.r; ++R) {
            for (let C = range.s.c; C <= range.e.c; ++C) {
              const cellAddress = XLSX.utils.encode_cell({ c: C, r: R });
              
              if (!ws[cellAddress]) {
                ws[cellAddress] = { t: 's', v: '' };
              }
              
              // Criar objeto de estilo se não existir
              if (!ws[cellAddress].s) {
                ws[cellAddress].s = {};
              }
              
              // Estilo base para todas as células
              ws[cellAddress].s = {
                alignment: { horizontal: "center", vertical: "center" },
                border: {
                  top: { style: "thin", color: { rgb: "FF000000" } },
                  bottom: { style: "thin", color: { rgb: "FF000000" } },
                  left: { style: "thin", color: { rgb: "FF000000" } },
                  right: { style: "thin", color: { rgb: "FF000000" } }
                }
              };
              
              // Estilo especial para linha de cabeçalho (primeira linha)
              if (R === 0) {
                ws[cellAddress].s.fill = {
                  fgColor: { rgb: "FFD3D3D3" }
                };
              }
            }
          }
        };

        // Helper: converte objeto com arrays em array de linhas
        const toRows = (obj) => {
          if (!obj) return [];
          if (Array.isArray(obj)) return obj;
          const keys = Object.keys(obj);
          if (keys.length === 0) return [];
          const len = Math.max(
            ...keys.map(k => (Array.isArray(obj[k]) ? obj[k].length : 0)),
            0
          );
          const rows = [];
          for (let i = 0; i < len; i++) {
            const row = {};
            keys.forEach(k => {
              row[k] = Array.isArray(obj[k]) ? obj[k][i] : obj[k];
            });
            rows.push(row);
          }
          return rows;
        };

        // Planilha "Top_Saldo"
        const topSaldoRows = toRows(data.top_saldo);
        if (topSaldoRows.length > 0) {
          const wsTopSaldo = XLSX.utils.json_to_sheet(topSaldoRows);
          applySheetStyles(wsTopSaldo);
          XLSX.utils.book_append_sheet(wb, wsTopSaldo, 'Top_Saldo');
        }

        // Planilha "Top_Receber"
        const topReceberRows = toRows(data.top_receber);
        if (topReceberRows.length > 0) {
          const wsTopReceber = XLSX.utils.json_to_sheet(topReceberRows);
          applySheetStyles(wsTopReceber);
          XLSX.utils.book_append_sheet(wb, wsTopReceber, 'Top_Receber');
        }

        // Planilha "Relatorio_Geral"
        if (data.relatorio_geral) {
          const wsRelatorioGeral = XLSX.utils.json_to_sheet(data.relatorio_geral);
          applySheetStyles(wsRelatorioGeral);
          XLSX.utils.book_append_sheet(wb, wsRelatorioGeral, 'Relatorio_Geral');
        }

        // Planilha "Mes_Proximo"
        if (data.mes_proximo) {
          const wsMesProximo = XLSX.utils.json_to_sheet([{ mes_proximo: data.mes_proximo }]);
          applySheetStyles(wsMesProximo);
          XLSX.utils.book_append_sheet(wb, wsMesProximo, 'Mes_Proximo');
        }

        // Planilha "Dados_Pagina"
        if (data.dados_da_pagina) {
          const wsDadosPagina = XLSX.utils.json_to_sheet([data.dados_da_pagina]);
          applySheetStyles(wsDadosPagina);
          XLSX.utils.book_append_sheet(wb, wsDadosPagina, 'Dados_Pagina');
        }

        // Planilha "Tabela_3"
        if (data.tabela_3) {
          const wsTabela3 = XLSX.utils.json_to_sheet(data.tabela_3);
          applySheetStyles(wsTabela3);
          XLSX.utils.book_append_sheet(wb, wsTabela3, 'Tabela_3');
        }

        // Planilha "Data_Atual"
        if (data.data_atual) {
          const wsDataAtual = XLSX.utils.json_to_sheet([{ data_atual: data.data_atual }]);
          applySheetStyles(wsDataAtual);
          XLSX.utils.book_append_sheet(wb, wsDataAtual, 'Data_Atual');
        }

        // Planilha "Total_Ausentes"
        if (data.total_ausentes !== undefined) {
          const wsTotalAusentes = XLSX.utils.json_to_sheet([{ total_ausentes: data.total_ausentes }]);
          applySheetStyles(wsTotalAusentes);
          XLSX.utils.book_append_sheet(wb, wsTotalAusentes, 'Total_Ausentes');
        }

        // Gerar e baixar o arquivo .xlsx com configurações para preservar estilos
        const filename = `banco_horas_dados_${new Date().toISOString().split('T')[0]}.xlsx`;
        XLSX.writeFile(wb, filename, { bookType: 'xlsx' });
        
        console.log('✅ Dados exportados com sucesso:', filename);
      })
      .catch(error => {
        console.error('❌ Erro ao buscar dados da API:', error);
        alert('Erro ao exportar dados. Verifique o console para mais detalhes.');
      });
  } catch (error) {
    console.error('❌ Erro ao exportar dados:', error);
    alert('Erro ao exportar dados. Verifique o console para mais detalhes.');
  }
}

// Carregar dados salvos do localStorage (se existirem)
carregarDadosSalvos();

/* Fim [Banco de dados] */

// ✅ Seção de variáveis obsoletas removida - agora usa exclusivamente dados da API tabela_3
// As variáveis datadash_4, datadash_6, datadash_9 não são mais necessárias

function calcularCompensacao() {
  // Calcular compensação baseado exclusivamente nos eventos do servidor - APENAS DO DIA ATUAL
  const today = new Date();
  const todayStr = today.toISOString().split('T')[0]; // YYYY-MM-DD
  
  const contadores = {
    folga: 0,
    ferias: 0,
    atestado: 0,
    falta: 0
  };

  // Filtrar e contar apenas os eventos de hoje (carregados do servidor)
  const todayEvents = calendarEvents.filter(event => {
    const eventDate = new Date(event.date);
    const eventDateStr = eventDate.toISOString().split('T')[0];
    return eventDateStr === todayStr;
  });

  todayEvents.forEach(event => {
    const absenceType = event.absenceType ? event.absenceType.toLowerCase() : '';
    
    if (absenceType === 'folga') {
      contadores.folga++;
    } else if (absenceType === 'ferias') {
      contadores.ferias++;
    } else if (absenceType === 'atestado') {
      contadores.atestado++;
    } else if (absenceType === 'falta') {
      contadores.falta++;
    }
  });

  if (window.DEBUG) console.log(`📊 Contadores de ausências para hoje (${todayStr}):`, contadores);
  return contadores;
}

// (Removido) Funções obsoletas substituídas por chamadas ao servidor via updateAbsenceOnServer()

// Função para mostrar notificação de mudança na tabela
// (Removido) showTableChangeNotification duplicado — usar a versão definida em api-loader.js

// Função para atualizar todas as ausências da tabela baseado no calendário
function refreshTableAbsencesFromCalendar() {
  if (window.DEBUG) console.log('🔄 Atualizando tabela com eventos do calendário (versão melhorada)...');
  
  // Se os dados da API já têm ausências, não sobrescrever
  const dadosTabela3 = getTabela3Data();
  if (dadosTabela3 && dadosTabela3.length > 0) {
    // Verificar se já há ausências nos dados da API
    const temAusenciasAPI = dadosTabela3.some(item => item.estaAusente);
    if (temAusenciasAPI) {
      console.log('✅ Dados da API já contêm ausências, mantendo valores atuais');
      return;
    }
  }
  
  const today = new Date();
  const todayStr = today.toISOString().split('T')[0];
  
  // Usar eventos já carregados em memória
  const events = calendarEvents || [];
  
  // Filtrar eventos para hoje
  const todayEvents = events.filter(event => {
    const eventDate = new Date(event.date);
    const eventDateStr = eventDate.toISOString().split('T')[0];
    return eventDateStr === todayStr;
  });
  
  if (window.DEBUG) console.log(`� ${todayEvents.length} eventos encontrados para hoje (${todayStr})`);
  
  if (todayEvents.length === 0) {
    console.log('⚠️ Nenhum evento para hoje, mantendo valores atuais da tabela');
    return;
  }
  
  // Atualizar apenas selects que têm correspondência exata
  const ausenciaSelects = document.querySelectorAll('.ausencia-select');
  
  ausenciaSelects.forEach(select => {
    const rowIndex = select.getAttribute('data-row-index');
    
    let matricula = '';
    let colaborador = '';
    
    if (dadosTabela3 && dadosTabela3[rowIndex]) {
      matricula = (dadosTabela3[rowIndex].Matrícula || '').toString();
      colaborador = dadosTabela3[rowIndex].Colaborador || '';
    }
    
    // Buscar evento com correspondência EXATA
    const event = todayEvents.find(event => {
      const eventEmployeeId = (event.employeeId || '').toString();
      return eventEmployeeId === matricula;
    });
    
    if (event) {
      // Mapear tipo de ausencia do calendário para a tabela
      const absenceMap = {
        'folga': 'Folga',
        'ferias': 'Ferias',
        'atestado': 'Atestado',
        'falta': 'Falta'
      };
      
      const absenceValue = absenceMap[event.absenceType] || event.absenceType;
      
      if (select.value !== absenceValue) {
        select.value = absenceValue;
        
        // Atualizar classes CSS
        select.classList.remove("folga", "falta", "ferias", "atestado");
        if (absenceValue) {
          select.classList.add(absenceValue.toLowerCase());
        }
        
  if (window.DEBUG) console.log(`✅ Ausência atualizada: ${matricula} - ${colaborador} → ${absenceValue}`);
      }
    }
    // NÃO limpar valores se não encontrar evento (manter estado atual)
  });
}

// Função para mostrar feedback de salvamento
function mostrarFeedbackSalvamento() {
  // Remover feedback anterior se existir
  const existingFeedback = document.querySelector(".save-feedback");
  if (existingFeedback) {
    existingFeedback.remove();
  }
  
  const feedbackDiv = document.createElement("div");
  feedbackDiv.className = "save-feedback";
  feedbackDiv.style.cssText = `
    position: fixed;
    top: 20px;
    left: 50%;
    transform: translateX(-50%);
    background: linear-gradient(135deg, #28a745, #20c997);
    color: white;
    padding: 12px 20px;
    border-radius: 25px;
    font-size: 14px;
    font-weight: bold;
    box-shadow: 0 4px 15px rgba(40, 167, 69, 0.4);
    z-index: 1001;
    animation: slideDownFade 0.3s ease;
    display: flex;
    align-items: center;
    gap: 8px;
  `;
  
  feedbackDiv.innerHTML = `
    <span style="font-size: 16px;">💾</span>
    <span>Alteração salva automaticamente!</span>
  `;
  
  document.body.appendChild(feedbackDiv);
  
  // Remover automaticamente após 2 segundos
  setTimeout(() => {
    if (feedbackDiv.parentNode) {
      feedbackDiv.style.animation = "slideUpFade 0.3s ease";
      setTimeout(() => {
        feedbackDiv.remove();
      }, 300);
    }
  }, 2000);
}

// Função para atualizar o modal de compensação se estiver aberto
function atualizarModalCompensacao() {
  const modal = document.getElementById('compensacaoModal');
  if (modal.classList.contains('show')) {
    // Reabrir o modal com dados atualizados
    openCompensacaoModal();
  }
}

// Função para gerar relatório detalhado de ausências do servidor
function gerarRelatorioAusencias() {
  const events = calendarEvents || []; // Usar eventos carregados do servidor
  const today = new Date();
  
  // Agrupar eventos por mês
  const eventosPorMes = {};
  
  events.forEach(event => {
    const eventDate = new Date(event.date);
    const mesAno = `${eventDate.getFullYear()}-${String(eventDate.getMonth() + 1).padStart(2, '0')}`;
    
    if (!eventosPorMes[mesAno]) {
      eventosPorMes[mesAno] = {
        folga: 0,
        ferias: 0,
        atestado: 0,
        falta: 0,
        eventos: []
      };
    }
    
    const tipo = event.absenceType || 'outros';
    if (eventosPorMes[mesAno][tipo] !== undefined) {
      eventosPorMes[mesAno][tipo]++;
    }
    
    eventosPorMes[mesAno].eventos.push(event);
  });
  
  if (window.DEBUG) {
    console.log('📊 RELATÓRIO DETALHADO DE ausenciaS (CALENDÁRIO)');
    console.log('='.repeat(50));
  }
  
  Object.keys(eventosPorMes)
    .sort()
    .forEach(mesAno => {
      const dados = eventosPorMes[mesAno];
      const [ano, mes] = mesAno.split('-');
      const nomesMeses = [
        'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
        'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
      ];
      const nomeMes = nomesMeses[parseInt(mes) - 1];
      
      if (window.DEBUG) {
        console.log(`\n📅 ${nomeMes} ${ano}`);
        console.log(`   🏖️ Folgas: ${dados.folga}`);
        console.log(`   ✈️ Ferias: ${dados.ferias}`);
        console.log(`   🏥 Atestados: ${dados.atestado}`);
        console.log(`   ⚠️ Faltas: ${dados.falta}`);
        console.log(`   📊 Total: ${dados.eventos.length}`);
      }
    });
  
  const total = calcularCompensacao();
  if (window.DEBUG) {
    console.log('\n' + '='.repeat(50));
    console.log('📈 RESUMO GERAL:');
    console.log(`   Total de eventos: ${events.length}`);
    console.log(`   🏖️ Total Folgas: ${total.folga}`);
    console.log(`   ✈️ Total Ferias: ${total.ferias}`);
    console.log(`   🏥 Total Atestados: ${total.atestado}`);
    console.log(`   ⚠️ Total Faltas: ${total.falta}`);
    console.log('='.repeat(50));
  }
  
  return eventosPorMes;
}

// Função para resetar todas as ausências do servidor
async function resetarAusenciasCalendario() {
  if (confirm('Tem certeza que deseja resetar TODOS os eventos do calendário? Esta ação removerá todas as ausências registradas no servidor e não pode ser desfeita.')) {
    try {
      // Deletar todos os eventos do servidor (seria necessário implementar uma rota específica)
      // Por enquanto, apenas limpar a variável local e recarregar
      console.log('⚠️ Função de reset completo do servidor não implementada ainda');
      
      // Limpar variável local
      calendarEvents = [];
      window.calendarEvents = [];
      
      // Recarregar eventos do servidor
      await loadEventsFromServer();
      
      // ✅ USAR função mais específica em vez de refreshTableAbsencesFromCalendar
      // refreshTableAbsencesFromCalendar();
      
      // Recarregar dados da API para garantir sincronização
      await carregarDadosAPI();
      
      // Mostrar feedback
      const notification = document.createElement('div');
      notification.style.cssText = `
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        background: linear-gradient(135deg, #dc3545, #c82333);
        color: white;
        padding: 20px 30px;
        border-radius: 10px;
        box-shadow: 0 8px 32px rgba(0,0,0,0.3);
        z-index: 1003;
        font-family: Arial, sans-serif;
        text-align: center;
      `;
      
      notification.innerHTML = `
        <div style="font-size: 24px; margin-bottom: 10px;">�</div>
        <strong>Eventos recarregados do servidor!</strong><br>
        <small>Calendário e tabela atualizados</small>
      `;
      
      document.body.appendChild(notification);
    
      
      setTimeout(() => {
        notification.remove();
      }, 3000);
      
      console.log('� Eventos recarregados do servidor');
    } catch (error) {
      console.error('❌ Erro ao resetar eventos:', error);
      alert('Erro ao resetar eventos. Verifique a conexão com o servidor.');
    }
  }
}

// Função para obter os dados atualizados baseados no servidor
function obterDadosAtualizados() {
  const events = calendarEvents || []; // Usar eventos do servidor
  const today = new Date();
  
  return {
    eventos: events,
    totalEventos: events.length,
    contadores: calcularCompensacao(),
    eventosHoje: events.filter(event => {
      const eventDate = new Date(event.date);
      return eventDate.toDateString() === today.toDateString();
    }).length,
    eventosFuturos: events.filter(event => {
      const eventDate = new Date(event.date);
      return eventDate > today;
    }).length,
    dataSource: 'server_api'
  };
}

// Função para resetar todas as ausencias para vazio
function resetarAusencias() {
  if (confirm('Tem certeza que deseja resetar todas as ausencias para "Vazio"? Esta alteração será salva permanentemente.')) {
    const selects = document.querySelectorAll('.ausencia-select');
    selects.forEach((select, index) => {
      select.value = "";
      // Note: Não modificamos mais datadash_13 diretamente, dados vêm da API
      select.classList.remove("folga", "falta", "ferias", "atestado");
    });
    
    // Salvar as alterações
    salvarDadosAusencias();
    
    // Atualizar modal se estiver aberto
    atualizarModalCompensacao();
    
    // Mostrar feedback
    mostrarFeedbackSalvamento();
    
    console.log('Todas as ausencias foram resetadas para vazio e salvas');
  }
}

// Função para abrir o modal de compensação
function openCompensacaoModal() {
  const modal = document.getElementById('compensacaoModal');
  const compensacaoData = document.getElementById('compensacaoData');
  const totalCompensacao = document.getElementById('totalCompensacao');
  
  if (!modal || !compensacaoData || !totalCompensacao) {
    return;
  }
  
  const dados = calcularCompensacao();
  const total = dados.folga + dados.ferias + dados.atestado + dados.falta;
  
  // Obter estatísticas adicionais do servidor
  const events = calendarEvents || []; // Usar eventos do servidor
  const today = new Date();
  const todayStr = today.toISOString().split('T')[0];
  
  // Carregar eventos automaticamente se não estiverem disponíveis
  if (events.length === 0) {
    loadEventsFromServer().then(() => {
      // Reabrir o modal com dados carregados
      setTimeout(() => openCompensacaoModal(), 100);
    });
    return;
  }
  
  // Contar eventos por período
  const todayEvents = events.filter(event => {
    const eventDate = new Date(event.date).toISOString().split('T')[0];
    return eventDate === todayStr;
  }).length;
  
  const futureEvents = events.filter(event => {
    const eventDate = new Date(event.date);
    return eventDate > today;
  }).length;
  
  const pastEvents = events.filter(event => {
    const eventDate = new Date(event.date);
    return eventDate < today;
  }).length;
  
  compensacaoData.innerHTML = `
    <div style="margin-bottom: 15px; text-align: center; padding: 10px; background: linear-gradient(135deg, #007bff, #0056b3); color: white; border-radius: 8px;">
      <h4 style="margin: 0; font-size: 16px;">📅 ausencias de Hoje - ${today.toLocaleDateString('pt-BR')}</h4>
    </div>
    
    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin-bottom: 20px;">
      <div class="compensacao-item folga">
        <div class="compensacao-item-header">
          <div class="compensacao-icon">🏖️</div>
          <div class="compensacao-info">
            <h3 class="compensacao-title">Folga</h3>
            <p class="compensacao-subtitle">Dias de descanso (hoje)</p>
          </div>
        </div>
        <div class="compensacao-count">${dados.folga}</div>
      </div>
      
      <div class="compensacao-item ferias">
        <div class="compensacao-item-header">
          <div class="compensacao-icon">✈️</div>
          <div class="compensacao-info">
            <h3 class="compensacao-title">Ferias</h3>
            <p class="compensacao-subtitle">Período de descanso (hoje)</p>
          </div>
        </div>
        <div class="compensacao-count">${dados.ferias}</div>
      </div>
      
      <div class="compensacao-item atestado">
        <div class="compensacao-item-header">
          <div class="compensacao-icon">🏥</div>
          <div class="compensacao-info">
            <h3 class="compensacao-title">Atestado</h3>
            <p class="compensacao-subtitle">Licença médica (hoje)</p>
          </div>
        </div>
        <div class="compensacao-count">${dados.atestado}</div>
      </div>
      
      <div class="compensacao-item falta">
        <div class="compensacao-item-header">
          <div class="compensacao-icon">⚠️</div>
          <div class="compensacao-info">
            <h3 class="compensacao-title">Falta</h3>
            <p class="compensacao-subtitle">ausencia não justificada (hoje)</p>
          </div>
        </div>
        <div class="compensacao-count">${dados.falta}</div>
      </div>
    </div>
    
    <div class="compensacao-summary" style="margin-top: 20px; padding: 15px; background: linear-gradient(135deg, #f8f9fa, #e9ecef); border-radius: 8px; border-left: 4px solid #17a2b8;">
      <h4 style="margin: 0 0 10px 0; color: #495057;">📊 Estatísticas Gerais do Calendário</h4>
      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: 10px; font-size: 14px;">
        <div style="text-align: center;">
          <strong style="color: #007bff;">${todayEvents}</strong><br>
          <small>Hoje</small>
        </div>
        <div style="text-align: center;">
          <strong style="color: #17a2b8;">${futureEvents}</strong><br>
          <small>Futuros</small>
        </div>
        <div style="text-align: center;">
          <strong style="color: #6c757d;">${pastEvents}</strong><br>
          <small>Passados</small>
        </div>
        <div style="text-align: center;">
          <strong style="color: #28a745;">${events.length}</strong><br>
          <small>Total Geral</small>
        </div>
      </div>
    </div>
  `;
  
  totalCompensacao.innerHTML = `
    <div style="text-align: center;">
      <strong>Total de ausencias Hoje: ${total} evento${total !== 1 ? 's' : ''}</strong><br>
      <small style="opacity: 0.8;">💾 Dados baseados no calendário</small><br>
      <small style="opacity: 0.6;">Última atualização: ${new Date().toLocaleString('pt-BR')}</small>
    </div>
  `;
  
  modal.style.display = ''; // Remover style inline
  modal.classList.add('show');
  
  // Adicionar animação de entrada nos itens com Animate.css
  setTimeout(() => {
    const items = document.querySelectorAll('.compensacao-item');
    items.forEach((item, index) => {
      setTimeout(() => {
        item.classList.add('animate__animated', 'animate__fadeInUp');
      }, index * 150);
    });
  }, 300);
}

// Função para fechar o modal
function closeModal() {
  const modal = document.getElementById('compensacaoModal');
  
  if (!modal) {
    return;
  }
  
  modal.classList.remove('show');
  // Forçar display none para garantir fechamento
  setTimeout(() => {
    if (!modal.classList.contains('show')) {
      modal.style.display = 'none';
    }
  }, 100);
  
  // Remover as classes de animação para reset
  setTimeout(() => {
    const items = document.querySelectorAll('.compensacao-item');
    items.forEach(item => {
      item.classList.remove('animate__animated', 'animate__fadeInUp');
    });
  }, 500);
}

// Fechar modal quando clicar fora dele (handler único consolidado)
window.addEventListener('click', function(event) {
  const compensacaoModal = document.getElementById('compensacaoModal');
  const eventModal = document.getElementById('eventModal');
  const calendarModal = document.getElementById('calendarModal');
  const calendarOptionsModal = document.getElementById('calendarOptionsModal');

  // Compensação
  if (event.target === compensacaoModal) {
    if (typeof closeModal === 'function') {
      closeModal();
    } else if (compensacaoModal) {
      compensacaoModal.classList.remove('show');
      setTimeout(() => {
        if (!compensacaoModal.classList.contains('show')) {
          compensacaoModal.style.display = 'none';
        }
      }, 100);
    }
  }

  // Visualização de evento
  if (event.target === eventModal) {
    if (typeof closeEventModal === 'function') {
      closeEventModal();
    } else if (eventModal) {
      eventModal.classList.remove('show');
      setTimeout(() => {
        if (!eventModal.classList.contains('show')) {
          eventModal.style.display = 'none';
        }
      }, 100);
    }
  }

  // Calendário (visualização)
  if (event.target === calendarModal) {
    if (typeof closeCalendarViewModal === 'function') {
      closeCalendarViewModal();
    } else if (calendarModal) {
      calendarModal.classList.remove('show');
      setTimeout(() => {
        if (!calendarModal.classList.contains('show')) {
          calendarModal.style.display = 'none';
        }
      }, 100);
    }
  }

  // Opções do calendário
  if (event.target === calendarOptionsModal) {
    if (typeof closeCalendarModal === 'function') {
      closeCalendarModal();
    } else if (calendarOptionsModal) {
      calendarOptionsModal.classList.remove('show');
      setTimeout(() => {
        if (!calendarOptionsModal.classList.contains('show')) {
          calendarOptionsModal.style.display = 'none';
        }
      }, 100);
    }
  }
});

// Fechar modais com a tecla ESC (handler único consolidado)
document.addEventListener('keydown', function(event) {
  if (event.key === 'Escape') {
    // Usar funções específicas quando disponíveis
    if (typeof closeCalendarModal === 'function') closeCalendarModal();
    if (typeof closeCalendarViewModal === 'function') closeCalendarViewModal();
    if (typeof closeEventModal === 'function') closeEventModal();
    if (typeof closeModal === 'function') closeModal(); // compensacaoModal

    // Fallback: esconder quaisquer modais remanescentes
    const modals = ['compensacaoModal', 'eventModal', 'calendarModal', 'calendarOptionsModal'];
    modals.forEach(modalId => {
      const modal = document.getElementById(modalId);
      if (modal && modal.classList.contains('show')) {
        modal.classList.remove('show');
        setTimeout(() => {
          if (!modal.classList.contains('show')) {
            modal.style.display = 'none';
          }
        }, 100);
      }
    });
  }
});

// Função para atualizar a data atual no botão calendário
function updateCurrentDate() {
  const now = new Date();
  const options = { 
    day: '2-digit', 
    month: 'short', 
    year: 'numeric' 
  };
  const dateString = now.toLocaleDateString('pt-BR', options);
  const currentDateElement = document.getElementById('currentDate');
  if (currentDateElement) {
    currentDateElement.textContent = dateString;
  }
}

// Atualizar a data quando a página carregar
// Bloco único de inicialização DOMContentLoaded consolidado
document.addEventListener('DOMContentLoaded', function() {
  // 1) Garantir que todos os modais estejam fechados
  const modalIds = ['compensacaoModal', 'eventModal', 'calendarModal', 'calendarOptionsModal'];
  modalIds.forEach(modalId => {
    const modal = document.getElementById(modalId);
    if (modal) {
      modal.classList.remove('show');
      modal.style.display = 'none';
    }
  });

  // 2) Data atual no header
  updateCurrentDate();
  setInterval(updateCurrentDate, 60000);

  // 3) Estilos dos indicadores de ausência
  addIndicatorStyles();

  // 4) Carregar dados da API e renderizar calendário após chegada
  if (typeof carregarDadosAPI === 'function') {
    carregarDadosAPI().then(() => {
      if (typeof renderCalendar === 'function') {
        setTimeout(renderCalendar, 200);
      }
    }).catch(() => {});
  }

  // 5) Inicializar atualizador de ausências após carregamento inicial
  setTimeout(() => {
    if (typeof startAbsenceUpdater === 'function') startAbsenceUpdater();
  }, 2000);

  // 6) Utilitários de debug no window
  if (typeof verificarDadosCarregados === 'function') window.verificarDadosCarregados = verificarDadosCarregados;
  if (typeof carregarDadosAPI === 'function') window.carregarDadosAPI = carregarDadosAPI;
  if (typeof getTabela3Data === 'function') window.getTabela3Data = getTabela3Data;

  // 7) Sanitizar modal que possa iniciar aberto por algum estado residual
  const modal = document.getElementById('compensacaoModal');
  if (modal && modal.classList.contains('show')) {
    modal.classList.remove('show');
  }

  // 8) Qualquer preparação adicional dependente dos dados locais
  setTimeout(function() {
    if (typeof getEmployeesFromData === 'function') {
      getEmployeesFromData();
    }
  }, 1000);

  syncMesOverrideSelect();
});

// Funções para o Modal de Opções do Calendário
function openCalendarModal() {
  const modal = document.getElementById('calendarOptionsModal');
  syncMesOverrideSelect();
  modal.style.display = ''; // Remover style inline
  modal.classList.add('show');
}

function closeCalendarModal() {
  const modal = document.getElementById('calendarOptionsModal');
  modal.classList.remove('show');
  // Forçar display none para garantir fechamento
  setTimeout(() => {
    if (!modal.classList.contains('show')) {
      modal.style.display = 'none';
    }
  }, 100);
}

function selectOption(option) {
  closeCalendarModal();
  
  if (option === 'database') {

  } else if (option === 'calendar') {
    // Abrir o calendário
    openCalendarViewModal();
  } else if (option === 'export') {
    // Abrir modal de exportação
    openExportModal();
  }
}

// Modal de exportação
function openExportModal() {
  const modal = document.getElementById('exportModal');
  if (!modal) return;
  // Pré-preencher datas com mês atual
  const start = document.getElementById('exportStartDate');
  const end = document.getElementById('exportEndDate');
  const today = new Date();
  const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
  const lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0);
  if (start && !start.value) start.value = firstDay.toISOString().split('T')[0];
  if (end && !end.value) end.value = lastDay.toISOString().split('T')[0];
  modal.style.display = '';
  modal.classList.add('show');
}

function closeExportModal() {
  const modal = document.getElementById('exportModal');
  if (!modal) return;
  modal.classList.remove('show');
  setTimeout(() => { if (!modal.classList.contains('show')) modal.style.display = 'none'; }, 120);
}

async function exportEventsByPeriod() {
  try {
    const startInput = document.getElementById('exportStartDate');
    const endInput = document.getElementById('exportEndDate');
    const start = startInput?.value;
    const end = endInput?.value;

    if (!start || !end) {
      alert('Informe a data inicial e final.');
      return;
    }
    if (start > end) {
      alert('A data inicial não pode ser maior que a final.');
      return;
    }

    // Garantir que eventos estão atualizados
    if (!Array.isArray(calendarEvents) || calendarEvents.length === 0) {
      await loadEventsFromServer();
    }

    // Filtrar por período (datas em formato YYYY-MM-DD)
    const filtered = (calendarEvents || []).filter(ev => ev.date >= start && ev.date <= end);

    if (filtered.length === 0) {
      alert('Nenhum evento encontrado no período selecionado.');
      return;
    }

    // Montar dados para Excel
    const rows = filtered.map(ev => ({
      Data: ev.date,
      Matricula: ev.employeeId,
      Colaborador: ev.employeeName,
      Tipo: getAbsenceTypeName(ev.absenceType),
      Observacoes: ev.notes || '',
      CriadoEm: ev.createdAt ? new Date(ev.createdAt).toLocaleString('pt-BR') : ''
    }));

    // Criar workbook e sheet
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(rows);
    XLSX.utils.book_append_sheet(wb, ws, 'Eventos');

    const filename = `eventos_${start}_a_${end}.xlsx`;
    XLSX.writeFile(wb, filename, { bookType: 'xlsx' });

    closeExportModal();
  } catch (err) {
    console.error('Erro ao exportar eventos:', err);
    alert('Erro ao exportar eventos. Veja o console para detalhes.');
  }
}

// Função para carregar eventos do servidor
async function loadEventsFromServer() {
  try {
    if (window.DEBUG) {
      console.log('🔄 Carregando eventos do servidor...');
      console.log('📡 Fazendo requisição para: /eventos');
    }
    
    const response = await fetch('/eventos', {
      method: 'GET',
      credentials: 'include'
    });
  if (window.DEBUG) console.log('📡 Status da resposta:', response.status, response.statusText);
    
    const data = await response.json();
  if (window.DEBUG) console.log('📋 Dados recebidos do servidor:', data);
    
    if (response.ok) {
      calendarEvents = data.eventos || [];
      window.calendarEvents = calendarEvents; // Tornar disponível globalmente
      if (window.DEBUG) {
        console.log(`✅ ${calendarEvents.length} eventos carregados do servidor`);
        console.log('📊 calendarEvents após carregamento:', calendarEvents);
      }
      
      // Log detalhado dos eventos carregados
      if (calendarEvents.length > 0) {
        console.log('📅 Eventos carregados:', calendarEvents.map(event => ({
          id: event.id,
          data: event.date,
          colaborador: event.employeeName,
          tipo: event.absenceType
        })));
      } else {
        console.warn('⚠️ Nenhum evento encontrado na resposta do servidor');
      }
      
      return calendarEvents;
    } else {
      console.error('❌ Erro ao carregar eventos:', data.erro || 'Erro desconhecido');
      return [];
    }
  } catch (error) {
    console.error('❌ Erro na requisição de eventos:', error);
    console.error('❌ Stack trace:', error.stack);
    return [];
  }
}

// Função para atualizar ausência via servidor
async function updateAbsenceOnServer(matricula, colaborador, tipoAusencia) {
  try {
    const data = {
      matricula: matricula.toString(),
      colaborador: colaborador,
      tipoAusencia: tipoAusencia,
      data: new Date().toISOString().split('T')[0]
    };
    
    console.log('🔄 Atualizando ausência no servidor:', data);
    
    const response = await fetch('/ausencia', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
      body: JSON.stringify(data)
    });
    
    const result = await response.json();
    
    if (response.ok && result.sucesso) {
      console.log('✅ Ausência atualizada no servidor');
      // Recarregar eventos
      await loadEventsFromServer();
      return true;
    } else {
      console.error('❌ Erro ao atualizar ausência:', result.erro);
      return false;
    }
  } catch (error) {
    console.error('❌ Erro na requisição de atualização:', error);
    return false;
  }
}

// Funções para o Modal do Calendário
function openCalendarViewModal() {
  const modal = document.getElementById('calendarModal');
  modal.style.display = ''; // Remover style inline
  modal.classList.add('show');
  
  // Garantir que os eventos estejam carregados antes de renderizar
  if (window.DEBUG) {
    console.log('📅 Abrindo calendário...');
    console.log(`📊 Eventos disponíveis: ${calendarEvents ? calendarEvents.length : 0}`);
  }
  
  if (!calendarEvents || calendarEvents.length === 0) {
  if (window.DEBUG) console.log('🔄 Eventos não carregados, carregando agora...');
    loadEventsFromServer().then(() => {
  if (window.DEBUG) console.log('✅ Eventos carregados, renderizando calendário...');
      renderCalendar();
    });
  } else {
  if (window.DEBUG) console.log('✅ Eventos já carregados, renderizando calendário...');
    renderCalendar();
  }
}

function closeCalendarViewModal() {
  const modal = document.getElementById('calendarModal');
  modal.classList.remove('show');
  // Forçar display none para garantir fechamento
  setTimeout(() => {
    if (!modal.classList.contains('show')) {
      modal.style.display = 'none';
    }
  }, 100);
}

function renderCalendar() {
  const monthNames = [
    'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
    'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
  ];
  
  const dayNames = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
  
  if (window.DEBUG) {
    console.log('🔄 Renderizando calendário...');
    console.log(`📊 Eventos para processar: ${calendarEvents ? calendarEvents.length : 0}`);
  }
  
  const currentMonth = document.getElementById('currentMonth');
  const calendarDays = document.getElementById('calendarDays');
  
  if (!currentMonth || !calendarDays) {
    console.error('❌ Elementos do calendário não encontrados');
    return;
  }
  
  currentMonth.textContent = `${monthNames[currentCalendarDate.getMonth()]} ${currentCalendarDate.getFullYear()}`;
  
  // Limpar dias existentes
  calendarDays.innerHTML = '';
  
  // Primeiro dia do mês
  const firstDay = new Date(currentCalendarDate.getFullYear(), currentCalendarDate.getMonth(), 1);
  const lastDay = new Date(currentCalendarDate.getFullYear(), currentCalendarDate.getMonth() + 1, 0);
  
  // Dias do mês anterior para completar a primeira semana
  const startDate = new Date(firstDay);
  startDate.setDate(startDate.getDate() - firstDay.getDay());
  
  let diasComEventos = 0;
  
  // Gerar 42 dias (6 semanas)
  for (let i = 0; i < 42; i++) {
    const date = new Date(startDate);
    date.setDate(startDate.getDate() + i);
    
    const dayElement = document.createElement('div');
    dayElement.className = 'calendar-day';
    
    // Criar container para o conteúdo do dia
    const dayContent = document.createElement('div');
    dayContent.className = 'day-content';
    dayContent.textContent = date.getDate();
    
    // Adicionar nome do dia da semana para TODOS os dias
    const dayNameElement = document.createElement('div');
    dayNameElement.className = 'day-name';
    dayNameElement.textContent = dayNames[date.getDay()];
    dayElement.appendChild(dayNameElement);
    
    // Verificar se é do mês atual
    if (date.getMonth() !== currentCalendarDate.getMonth()) {
      dayElement.classList.add('other-month');
    }
    
    // Verificar se é domingo (dia 0)
    if (date.getDay() === 0) {
      dayElement.classList.add('sunday');
    }
    
    // Verificar se é hoje
    const today = new Date();
    const todayDateString = today.toISOString().split('T')[0]; // Formato YYYY-MM-DD
    const dayDateString = date.toISOString().split('T')[0];
    
    if (dayDateString === todayDateString) {
      dayElement.classList.add('today');
    }
    
    // Verificar se está selecionado
    if (selectedDate && date.toDateString() === selectedDate.toDateString()) {
      dayElement.classList.add('selected');
    }
    
    // Verificar se há eventos neste dia (usar event.date diretamente)
    const hasEvent = calendarEvents && calendarEvents.some(event => {
      // Comparar apenas a parte da data (YYYY-MM-DD)
      const eventDateString = event.date; // Já está no formato YYYY-MM-DD
      return eventDateString === dayDateString;
    });
    
    if (hasEvent) {
      dayElement.classList.add('has-event');
      
      // Verificar se é um evento de dia anterior (passado)
      const today = new Date();
      const todayDateString = today.toISOString().split('T')[0];
      const isPastEvent = dayDateString < todayDateString;
      
      if (isPastEvent) {
        dayElement.classList.add('past-event');
      }
      
      diasComEventos++;
      
      // Encontrar os eventos para este dia
      const eventosNoDia = calendarEvents.filter(event => 
        event.date === dayDateString
      );
      
      // Adicionar título com informações dos eventos
      const eventosTexto = eventosNoDia.map(event => 
        `${event.employeeName}: ${getAbsenceTypeName(event.absenceType)}`
      ).join('\n');
      
      dayElement.title = eventosTexto;
      
      // Debug para dias do mês atual com eventos
      if (window.DEBUG && date.getMonth() === currentCalendarDate.getMonth()) {
        console.log(`📅 Dia ${date.getDate()}: ${eventosNoDia.length} evento(s)${isPastEvent ? ' (PASSADO)' : ''}`);
      }
    }
    
    // Adicionar evento de clique
    dayElement.addEventListener('click', () => {
      // Remover seleção anterior
      document.querySelectorAll('.calendar-day.selected').forEach(el => {
        el.classList.remove('selected');
      });
      
      // Adicionar seleção atual
      dayElement.classList.add('selected');
      selectedDate = new Date(date);
      
      // Atualizar o botão baseado se há eventos
      updateCalendarActionButton();
    });
    
    // Adicionar o conteúdo do dia ao elemento
    dayElement.appendChild(dayContent);
    calendarDays.appendChild(dayElement);
  }
  
  if (window.DEBUG) console.log(`✅ Calendário renderizado com ${diasComEventos} dias contendo eventos`);
  
  // Atualizar o botão de ação se houver data selecionada
  if (selectedDate) {
    updateCalendarActionButton();
  }
}

function goToToday() {
  currentCalendarDate = new Date();
  selectedDate = new Date();
  renderCalendar();
}

function addEventToSelectedDate() {
  if (selectedDate) {
    openEventModal(selectedDate);
  } else {
    alert('Por favor, selecione uma data primeiro.');
  }
}

// Função para atualizar o botão de ação do calendário
function updateCalendarActionButton() {
  const actionButton = document.querySelector('#calendarModal .modal-footer .control-button.export-btn');
  if (!actionButton || !selectedDate) return;
  
  // Verificar se há eventos na data selecionada
  const selectedDateString = selectedDate.toISOString().split('T')[0];
  const eventsOnSelectedDate = calendarEvents.filter(event => 
    event.date === selectedDateString
  );
  
  if (eventsOnSelectedDate.length > 0) {
    // Há eventos - mostrar botão "Ver Eventos"
    actionButton.onclick = () => showEventsForSelectedDate();
    actionButton.innerHTML = '👁️ Ver Eventos';
    actionButton.title = `${eventsOnSelectedDate.length} evento(s) nesta data`;
  } else {
    // Não há eventos - mostrar botão "Adicionar Evento"
    actionButton.onclick = () => addEventToSelectedDate();
    actionButton.innerHTML = '➕ Adicionar Evento';
    actionButton.title = 'Adicionar novo evento para esta data';
  }
}

// Função para mostrar eventos da data selecionada
function showEventsForSelectedDate() {
  if (!selectedDate) return;
  
  const selectedDateString = selectedDate.toISOString().split('T')[0];
  const eventsOnSelectedDate = calendarEvents.filter(event => 
    event.date === selectedDateString
  );
  
  if (eventsOnSelectedDate.length === 0) {
    alert('Nenhum evento encontrado para esta data.');
    return;
  }
  
  openEventsViewModal(eventsOnSelectedDate, selectedDate);
}

// Função para abrir modal de visualização de eventos
function openEventsViewModal(events, date) {
  const modal = document.getElementById('eventsViewModal');
  if (!modal) {
    createEventsViewModal();
    return openEventsViewModal(events, date);
  }
  
  const dateFormatted = date.toLocaleDateString('pt-BR', { 
    weekday: 'long', 
    year: 'numeric', 
    month: 'long', 
    day: 'numeric' 
  });
  
  document.getElementById('eventsViewTitle').textContent = `Eventos em ${dateFormatted}`;
  
  const eventsList = document.getElementById('eventsViewList');
  eventsList.innerHTML = '';
  
  events.forEach(event => {
    const eventItem = document.createElement('div');
    eventItem.className = 'event-item';
    
    const absenceTypeMap = {
      'folga': { name: 'Folga', color: '#48bb78', icon: '🏠' },
      'ferias': { name: 'Férias', color: '#ed8936', icon: '🏖️' },
      'atestado': { name: 'Atestado', color: '#667eea', icon: '🏥' },
      'falta': { name: 'Falta', color: '#e53e3e', icon: '❌' }
    };
    
    const typeInfo = absenceTypeMap[event.absenceType] || { name: event.absenceType, color: '#718096', icon: '📋' };
    
    eventItem.innerHTML = `
      <div class="event-header" style="background: ${typeInfo.color};">
        <span class="event-icon">${typeInfo.icon}</span>
        <span class="event-type">${typeInfo.name}</span>
        <button class="event-delete-btn" onclick="deleteEventFromView('${event.id}')" title="Excluir evento">🗑️</button>
      </div>
      <div class="event-content">
        <div class="event-employee">
          <strong>Colaborador:</strong> ${event.employeeName}
        </div>
        <div class="event-id">
          <strong>ID:</strong> ${event.employeeId}
        </div>
        ${event.notes ? `<div class="event-notes"><strong>Observações:</strong> ${event.notes}</div>` : ''}
        <div class="event-meta">
          <small>Criado em: ${new Date(event.createdAt).toLocaleString('pt-BR')}</small>
        </div>
      </div>
    `;
    
    eventsList.appendChild(eventItem);
  });
  
  modal.style.display = 'block';
  setTimeout(() => modal.classList.add('show'), 10);
}

// Função para criar o modal de visualização de eventos
function createEventsViewModal() {
  const modalHTML = `
    <div id="eventsViewModal" class="modal">
      <div class="modal-content" style="max-width: 600px;">
        <div class="modal-header">
          <span class="close" onclick="closeEventsViewModal()">&times;</span>
          <h2 id="eventsViewTitle">📅 Eventos do Dia</h2>
        </div>
        <div class="modal-body">
          <div id="eventsViewList" class="events-list">
            <!-- Os eventos serão listados aqui -->
          </div>
        </div>
        <div class="modal-footer">
          <button onclick="addEventToCurrentDate()" class="control-button export-btn">➕ Adicionar Evento</button>
          <button onclick="closeEventsViewModal()" class="control-button">Fechar</button>
        </div>
      </div>
    </div>
  `;
  
  document.body.insertAdjacentHTML('beforeend', modalHTML);
}

// Função para fechar modal de visualização de eventos
function closeEventsViewModal() {
  const modal = document.getElementById('eventsViewModal');
  if (modal) {
    modal.classList.remove('show');
    setTimeout(() => {
      modal.style.display = 'none';
    }, 300);
  }
}

// Função para adicionar evento na data atual (do modal de eventos)
function addEventToCurrentDate() {
  closeEventsViewModal();
  if (selectedDate) {
    openEventModal(selectedDate);
  }
}

// Função para excluir evento do modal de visualização
async function deleteEventFromView(eventId) {
  if (!confirm('Tem certeza que deseja excluir este evento?')) return;
  
  try {
    const response = await fetch(`/eventos/${eventId}`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json'
      },
      credentials: 'include'
    });
    
    if (response.ok) {
      // Recarregar eventos do servidor
      await loadEventsFromServer();
      
      // Fechar modal atual e reabrir com eventos atualizados
      closeEventsViewModal();
      
      // Renderizar calendário novamente
      renderCalendar();
      
      // Mostrar notificação de sucesso
      showTableChangeNotification('Evento excluído', 'com sucesso');
      
      // Recarregar dados da API para atualizar a tabela
      setTimeout(() => {
        if (typeof carregarDadosAPI === 'function') {
          carregarDadosAPI();
        }
      }, 500);
      
    } else {
      throw new Error('Erro ao excluir evento');
    }
  } catch (error) {
    console.error('Erro ao excluir evento:', error);
    alert('Erro ao excluir evento. Tente novamente.');
  }
}

// Event listeners para navegação do calendário
document.addEventListener('DOMContentLoaded', function() {
  const prevMonthBtn = document.getElementById('prevMonth');
  const nextMonthBtn = document.getElementById('nextMonth');
  
  if (prevMonthBtn) {
    prevMonthBtn.addEventListener('click', () => {
      currentCalendarDate.setMonth(currentCalendarDate.getMonth() - 1);
      renderCalendar();
    });
  }
  
  if (nextMonthBtn) {
    nextMonthBtn.addEventListener('click', () => {
      currentCalendarDate.setMonth(currentCalendarDate.getMonth() + 1);
      renderCalendar();
    });
  }
});

// Funções para o Modal de Evento
function openEventModal(date) {
  const modal = document.getElementById('eventModal');
  const eventDateInput = document.getElementById('eventDate');
  const employeeInput = document.getElementById('employeeInput');
  const absenceTypeSelect = document.getElementById('absenceType');
  const feriassDurationGroup = document.getElementById('feriassDurationGroup');
  const atestadoDurationGroup = document.getElementById('atestadoDurationGroup');
  const folgaDurationGroup = document.getElementById('folgaDurationGroup');
  
  // Formatar a data para exibição
  const formattedDate = date.toLocaleDateString('pt-BR', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
  
  eventDateInput.value = formattedDate;
  
  // Armazenar a data selecionada globalmente para verificações
  selectedDate = date;
  
  // Preencher o datalist de colaboradores
  populateEmployeeDatalist();
  
  // Configurar o botão de alternância
  setupToggleButton();
  
  // Configurar evento para mostrar/ocultar duração baseado no tipo de ausência
  absenceTypeSelect.addEventListener('change', function() {
    // Ocultar todos os grupos de duração primeiro
    feriassDurationGroup.style.display = 'none';
    atestadoDurationGroup.style.display = 'none';
    folgaDurationGroup.style.display = 'none';
    
    // Mostrar o grupo apropriado baseado no tipo selecionado
    if (this.value === 'ferias') {
      feriassDurationGroup.style.display = 'block';
    } else if (this.value === 'atestado') {
      atestadoDurationGroup.style.display = 'block';
    } else if (this.value === 'folga') {
      folgaDurationGroup.style.display = 'block';
    }
  });
  
  // Verificar conflitos iniciais após um pequeno delay (para permitir que os eventos sejam anexados)
  setTimeout(() => {
    checkEmployeeConflicts();
  }, 100);
  
  modal.style.display = ''; // Remover style inline
  modal.classList.add('show');
}

function closeEventModal() {
  const modal = document.getElementById('eventModal');
  modal.classList.remove('show');
  // Forçar display none para garantir fechamento
  setTimeout(() => {
    if (!modal.classList.contains('show')) {
      modal.style.display = 'none';
    }
  }, 100);
  
  // Limpar avisos de conflito
  hideConflictWarning();
  
  // Limpar o formulário
  document.getElementById('employeeInput').value = '';
  document.getElementById('employeeSelect').value = '';
  document.getElementById('absenceType').value = '';
  document.getElementById('feriassDuration').value = '1';
  document.getElementById('atestadoDuration').value = '1';
  document.getElementById('folgaDuration').value = '1';
  document.getElementById('feriassDurationGroup').style.display = 'none';
  document.getElementById('atestadoDurationGroup').style.display = 'none';
  document.getElementById('folgaDurationGroup').style.display = 'none';
  document.getElementById('eventNotes').value = '';
}

function populateEmployeeSelect() {
  const employeeSelect = document.getElementById('employeeSelect');
  
  // Limpar opções existentes (exceto a primeira)
  employeeSelect.innerHTML = '<option value="">Selecione um colaborador...</option>';
  
  // Obter colaboradores dos dados existentes (do sistema)
  const employees = getEmployeesFromData();
  
  employees.forEach(employee => {
    const option = document.createElement('option');
    option.value = employee.matricula;
    
    // Marcar visualmente se está ausente
    if (employee.estaAusente) {
      option.textContent = `${employee.matricula} - ${employee.nome} [AUSENTE: ${employee.statusAusencia.toUpperCase()}]`;
      option.style.color = '#ff6b6b';
      option.style.fontWeight = 'bold';
    } else {
      option.textContent = `${employee.matricula} - ${employee.nome}`;
    }
    
    employeeSelect.appendChild(option);
  });
}

function populateEmployeeDatalist() {
  const employeeList = document.getElementById('employeeList');
  
  // Limpar opções existentes
  employeeList.innerHTML = '';
  
  // Obter colaboradores dos dados existentes
  const employees = getEmployeesFromData();
  
  employees.forEach(employee => {
    const option = document.createElement('option');
    option.value = employee.matricula;
    
    // Marcar visualmente se está ausente
    if (employee.estaAusente) {
      option.textContent = `${employee.matricula} - ${employee.nome} [AUSENTE: ${employee.statusAusencia.toUpperCase()}]`;
    } else {
      option.textContent = `${employee.matricula} - ${employee.nome}`;
    }
    
    employeeList.appendChild(option);
  });
  
  // Também preencher o select (caso o usuário alterne)
  populateEmployeeSelect();
  
  // Adicionar evento de input para filtrar em tempo real
  const employeeInput = document.getElementById('employeeInput');
  employeeInput.addEventListener('input', function() {
    const searchValue = this.value.toLowerCase();
    const filtered = employees.filter(emp => 
      emp.matricula.toLowerCase().includes(searchValue) ||
      emp.nome.toLowerCase().includes(searchValue)
    );
    
    // Atualizar o datalist com os resultados filtrados
    employeeList.innerHTML = '';
    filtered.forEach(employee => {
      const option = document.createElement('option');
      option.value = employee.matricula;
      
      // Marcar visualmente se está ausente
      if (employee.estaAusente) {
        option.textContent = `${employee.matricula} - ${employee.nome} [AUSENTE: ${employee.statusAusencia.toUpperCase()}]`;
      } else {
        option.textContent = `${employee.matricula} - ${employee.nome}`;
      }
      
      employeeList.appendChild(option);
    });
    
    // Verificar conflitos quando o usuário selecionar/digitar um colaborador
    checkEmployeeConflicts();
  });
  
  // Adicionar evento para o select também
  const employeeSelect = document.getElementById('employeeSelect');
  employeeSelect.addEventListener('change', checkEmployeeConflicts);
}

// Função para verificar conflitos de eventos para o colaborador selecionado
function checkEmployeeConflicts() {
  if (!selectedDate || !calendarEvents) return;
  
  const employeeInput = document.getElementById('employeeInput');
  const employeeSelect = document.getElementById('employeeSelect');
  let employeeId = '';
  
  // Determinar qual campo está sendo usado
  if (employeeInput.style.display !== 'none') {
    employeeId = employeeInput.value.trim();
  } else {
    employeeId = employeeSelect.value;
  }
  
  if (!employeeId) {
   
    hideConflictWarning();
    return;
  }
  
  // Verificar se há evento para este colaborador na data selecionada
  const dateStr = selectedDate.toISOString().split('T')[0];
  const existingEvent = calendarEvents.find(event => 
    event.date === dateStr && 
    (event.employeeId === employeeId || event.employeeId === employeeId.toString())
  );
  
  if (existingEvent) {
    showConflictWarning(existingEvent);
  } else {
    hideConflictWarning();
  }
}

// Função para mostrar aviso de conflito
function showConflictWarning(existingEvent) {
  // Remover aviso anterior se existir
  hideConflictWarning();
  
  const modal = document.getElementById('eventModal');
  const modalBody = modal.querySelector('.modal-body');
  
  const warningDiv = document.createElement('div');
  warningDiv.id = 'conflictWarning';
  warningDiv.style.cssText = `
    background: linear-gradient(135deg, #fff3cd, #ffeaa7);
    border: 2px solid #ffc107;
    border-radius: 8px;
    padding: 12px;
    margin: 10px 0;
    display: flex;
    align-items: center;
    gap: 10px;
    animation: slideDown 0.3s ease;
  `;
  
  warningDiv.innerHTML = `
    <span style="font-size: 20px;">⚠️</span>
    <div style="flex: 1;">
      <strong style="color: #856404;">CONFLITO DETECTADO!</strong><br>
      <small style="color: #856404;">
        Este colaborador já possui: <strong>${getAbsenceTypeName(existingEvent.absenceType)}</strong> em ${selectedDate.toLocaleDateString('pt-BR')}
      </small>
    </div>
    <button onclick="viewExistingEvent('${existingEvent.id}')" style="
      background: #ffc107;
      border: none;
      color: #856404;
      padding: 5px 10px;
      border-radius: 4px;
      cursor: pointer;
      font-size: 12px;
      font-weight: bold;
    ">Ver Evento</button>
  `;
  
  modalBody.insertBefore(warningDiv, modalBody.firstChild);
}

// Função para ocultar aviso de conflito
function hideConflictWarning() {
  const warningDiv = document.getElementById('conflictWarning');
  if (warningDiv) {
    warningDiv.remove();
  }
}

// Função para visualizar evento existente
function viewExistingEvent(eventId) {
  const existingEvent = calendarEvents.find(e => e.id === eventId);
  if (existingEvent) {
    const eventDate = new Date(existingEvent.date);
    alert(`📋 EVENTO EXISTENTE\n\nData: ${eventDate.toLocaleDateString('pt-BR')}\nColaborador: ${existingEvent.employeeName}\nTipo: ${getAbsenceTypeName(existingEvent.absenceType)}\nObservações: ${existingEvent.notes || 'Nenhuma'}\n\n💡 Para substituir, continue com o cadastro atual.`);
  }
}

function setupToggleButton() {
  const toggleBtn = document.getElementById('toggleEmployeeSelect');
  const employeeInput = document.getElementById('employeeInput');
  const employeeSelect = document.getElementById('employeeSelect');
  const container = document.querySelector('.employee-input-container');
  
  let isSelectMode = false;
  
  toggleBtn.addEventListener('click', function() {
    if (isSelectMode) {
      // Trocar para modo input
      employeeInput.style.display = 'block';
      employeeSelect.style.display = 'none';
      container.style.display = 'flex';
      toggleBtn.textContent = '📋';
      toggleBtn.title = 'Alternar para lista';
      isSelectMode = false;
    } else {
      // Trocar para modo select
      employeeInput.style.display = 'none';
      employeeSelect.style.display = 'block';
      container.style.display = 'block';
      toggleBtn.textContent = '✏️';
      toggleBtn.title = 'Alternar para digitação';
      isSelectMode = true;
    }
  });
}

function testDataAccess() {
  console.log('--- TESTE DE ACESSO AOS DADOS (APENAS API) ---');
  console.log('typeof tabela3Data:', typeof tabela3Data);
  console.log('tabela3Data completo:', tabela3Data);
  
  const dadosTabela3 = getTabela3Data();
  console.log('Dados da tabela_3 via API:', dadosTabela3 ? 'existem' : 'não existem');
  
  if (dadosTabela3) {
    if (Array.isArray(dadosTabela3)) {
      console.log('Estrutura: Array com', dadosTabela3.length, 'registros');
      if (dadosTabela3.length > 0) {
        console.log('Primeiros 3 registros:', dadosTabela3.slice(0, 3));
        console.log('Campos disponíveis:', Object.keys(dadosTabela3[0] || {}));
      }
    } else if (typeof dadosTabela3 === 'object') {
      console.log('Estrutura: Objeto com propriedades:', Object.keys(dadosTabela3));
      console.log('Amostra dos dados:', dadosTabela3);
    }
  } else {
    console.log('❌ Dados da tabela_3 não disponíveis - carregue os dados da API primeiro');
  }
  
  console.log('--- FIM DO TESTE ---');
}

function getEmployeesFromData() {
  // Chamar teste primeiro
  testDataAccess();
  
  // Extrair colaboradores únicos dos dados da API
  const employees = [];
  
  try {
    const dadosTabela3 = getTabela3Data();
    
    console.log('🔍 Estrutura dos dados recebidos:', {
      tipo: typeof dadosTabela3,
      isArray: Array.isArray(dadosTabela3),
      temDados: dadosTabela3 && (Array.isArray(dadosTabela3) ? dadosTabela3.length > 0 : Object.keys(dadosTabela3).length > 0)
    });
    
    if (dadosTabela3) {
      let registros = [];
      
      // Se é array, usar diretamente
      if (Array.isArray(dadosTabela3)) {
        registros = dadosTabela3;
      }
      // Se é objeto, converter para array ou acessar propriedade específica
      else if (typeof dadosTabela3 === 'object') {
        // Tentar diferentes estruturas possíveis
        if (dadosTabela3.dados) {
          registros = dadosTabela3.dados;
        } else if (dadosTabela3.registros) {
          registros = dadosTabela3.registros;
        } else {
          // Pegar todos os valores do objeto
          registros = Object.values(dadosTabela3);
        }
      }
      
      console.log(`📊 Processando ${registros.length} registros`);
      
      if (registros.length > 0) {
        console.log('✅ Usando dados da API tabela_3 para colaboradores');
        console.log('📋 Exemplo de registro:', registros[0]);
        
        const uniqueEmployees = {};
        
        // Iterar por todos os registros
        registros.forEach((registro, index) => {
          const matricula = registro.Matrícula || registro.matricula || registro.id;
          const colaborador = registro.Colaborador || registro.colaborador || registro.nome || registro.name;
          const statusAusencia = registro.statusAusencia || '';
          const estaAusente = registro.estaAusente || false;
          
          // Debug para os primeiros registros
          if (index < 3) {
            console.log(`Registro ${index}:`, { matricula, colaborador, statusAusencia, estaAusente, registro });
          }
          
          // Verificar se a matrícula e colaborador existem e são válidos
          if (matricula && colaborador && 
              matricula !== 'nan' && matricula !== '' && matricula !== null &&
              colaborador !== 'nan' && colaborador !== '' && colaborador !== null) {
            
            // Usar matrícula como chave única
            if (!uniqueEmployees[matricula]) {
              uniqueEmployees[matricula] = {
                matricula: matricula.toString(),
                nome: colaborador.trim(),
                statusAusencia: statusAusencia,
                estaAusente: estaAusente
              };
            }
          }
        });
        
        // Converter objeto para array
        Object.values(uniqueEmployees).forEach(emp => {
          employees.push(emp);
        });
        
        console.log(`✅ Total de funcionários únicos encontrados: ${employees.length}`);
        
        // Log de funcionários ausentes
        const ausentes = employees.filter(emp => emp.estaAusente);
        if (ausentes.length > 0) {
          console.log(`👥 Funcionários ausentes hoje (${ausentes.length}):`, ausentes.map(emp => `${emp.matricula} - ${emp.nome} (${emp.statusAusencia})`));
        }
      } else {
        console.log('❌ Registros estão vazios');
      }
    } else {
      console.log('❌ Dados da API não disponíveis');
    }
  } catch (error) {
    console.error('Erro ao carregar dados dos colaboradores:', error);
  }
  
  if (employees.length === 0) {
    console.warn('⚠️ Nenhum colaborador encontrado - verifique se a API está funcionando');
  }
  
  return employees.sort((a, b) => a.nome.localeCompare(b.nome));
}

// Função para limpar indicadores antigos
function clearAbsenceIndicators() {
  const indicators = document.querySelectorAll('.absence-indicator');
  indicators.forEach(indicator => indicator.remove());
}

// Função para adicionar indicadores visuais de ausências futuras
function addAbsenceIndicators() {
  // Limpar indicadores antigos
  clearAbsenceIndicators();
  
  const events = calendarEvents || []; // Usar eventos do servidor
  const today = new Date();
  
  // Obter eventos futuros (próximos 7 dias)
  const futureEvents = events.filter(event => {
    const eventDate = new Date(event.date);
    const daysDiff = Math.ceil((eventDate - today) / (1000 * 60 * 60 * 24));
    return daysDiff > 0 && daysDiff <= 7;
  });
  
  if (futureEvents.length > 0) {
    const tableRows = document.querySelectorAll('#tableBody13 tr');
    
    futureEvents.forEach(event => {
      // Buscar a linha correspondente ao colaborador
      for (let i = 0; i < tableRows.length; i++) {
        const row = tableRows[i];
        const matriculaCell = row.cells[0];
        
        if (matriculaCell && matriculaCell.textContent.trim() === event.employeeId) {
          // Adicionar indicador visual na linha
          const eventDate = new Date(event.date);
          const daysDiff = Math.ceil((eventDate - today) / (1000 * 60 * 60 * 24));
          
          // Criar elemento de indicador
          const indicator = document.createElement('div');
          indicator.className = 'absence-indicator';
          indicator.style.cssText = `
            position: absolute;
            top: 2px;
            right: 2px;
            width: 12px;
            height: 12px;
            border-radius: 50%;
            background: linear-gradient(45deg, #FF6B6B, #FF8E8E);
            box-shadow: 0 2px 4px rgba(0,0,0,0.2);
            z-index: 10;
            animation: pulseIndicator 2s infinite;
          `;
          indicator.title = `ausencia programada: ${getAbsenceTypeName(event.absenceType)} em ${eventDate.toLocaleDateString('pt-BR')} (${daysDiff} dia${daysDiff > 1 ? 's' : ''})`;
          
          // Adicionar ao primeiro cell (matrícula)
          if (matriculaCell.style.position !== 'relative') {
            matriculaCell.style.position = 'relative';
          }
          
          matriculaCell.appendChild(indicator);
          
          break;
        }
      }
    });
  }
}

// Função para adicionar estilos CSS do indicador
function addIndicatorStyles() {
  const style = document.createElement('style');
  style.textContent = `
    @keyframes pulseIndicator {
      0% { transform: scale(1); opacity: 1; }
      50% { transform: scale(1.2); opacity: 0.7; }
      100% { transform: scale(1); opacity: 1; }
    }
    
    .absence-indicator:hover {
      transform: scale(1.3) !important;
      cursor: pointer;
    }
  `;
  document.head.appendChild(style);
}

// Função para atualizar ausencias na tabela baseado nos eventos do calendário
function updateTableAbsences() {
  console.log('🔄 Atualizando ausencias da tabela baseado exclusivamente no calendário...');
  refreshTableAbsencesFromCalendar();
  
  // Adicionar indicadores para ausencias futuras
  addAbsenceIndicators();
}

// Função para mostrar notificação específica de ausencia aplicada
function showAbsenceNotification(employeeName, absenceType) {
  const notification = document.createElement('div');
  notification.style.cssText = `
    position: fixed;
    top: 70px;
    right: 20px;
    background: linear-gradient(135deg, #28a745, #20c997);
    color: white;
    padding: 15px 20px;
    border-radius: 10px;
    box-shadow: 0 4px 20px rgba(0,0,0,0.3);
    z-index: 1002;
    font-family: Arial, sans-serif;
    font-size: 14px;
    transform: translateX(100%);
    transition: transform 0.3s ease;
    max-width: 300px;
  `;
  
  const typeEmoji = {
    'Folga': '🏖️',
    'Ferias': '✈️',
    'Atestado': '🏥',
    'Falta': '❌'
  };
  
  notification.innerHTML = `
    <div style="display: flex; align-items: center; gap: 10px;">
      <span style="font-size: 20px;">${typeEmoji[absenceType] || '📋'}</span>
      <div>
        <strong>ausencia Aplicada!</strong><br>
        <small>${employeeName}</small><br>
        <small>Tipo: ${absenceType}</small>
      </div>
    </div>
  `;
  
  document.body.appendChild(notification);
  
  // Mostrar notificação
  setTimeout(() => {
    notification.style.transform = 'translateX(0)';
  }, 100);
  
  // Remover notificação após 3 segundos
  setTimeout(() => {
    notification.style.transform = 'translateX(100%)';
    setTimeout(() => {
      notification.remove();
    }, 300);
  }, 3000);
}

// Função para criar painel de resumo das ausencias
function createAbsenceSummaryPanel() {
  // Verificar se o painel já existe
  let panel = document.getElementById('absenceSummaryPanel');
  if (!panel) {
    panel = document.createElement('div');
    panel.id = 'absenceSummaryPanel';
    panel.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      padding: 15px;
      border-radius: 10px;
      box-shadow: 0 8px 32px rgba(0,0,0,0.3);
      z-index: 1000;
      max-width: 300px;
      min-width: 250px;
      font-family: Arial, sans-serif;
      transform: translateX(100%);
      transition: transform 0.3s ease;
    `;
    
    document.body.appendChild(panel);
  }
  
  return panel;
}

// Função para atualizar o painel de resumo
function updateAbsenceSummaryPanel() {
  const today = new Date();
  const todayStr = today.toISOString().split('T')[0];
  
  // Obter eventos do servidor
  const events = calendarEvents || [];
  
  // Filtrar eventos para hoje
  const todayEvents = events.filter(event => {
    const eventDate = new Date(event.date);
    const eventDateStr = eventDate.toISOString().split('T')[0];
    return eventDateStr === todayStr;
  });
  
  // Contar tipos de ausência
  const absenceCount = {};
  todayEvents.forEach(event => {
    const type = event.absenceType;
    absenceCount[type] = (absenceCount[type] || 0) + 1;
  });
  
  // Mostrar painel apenas se houver ausencias
  if (todayEvents.length > 0) {
    const panel = createAbsenceSummaryPanel();
    
    let content = `
      <div style="display: flex; align-items: center; margin-bottom: 10px;">
        <div style="width: 20px; height: 20px; background: #FFD700; border-radius: 50%; margin-right: 10px;"></div>
        <strong>ausencias Hoje</strong>
      </div>
      <div style="font-size: 12px; margin-bottom: 15px;">
        ${today.toLocaleDateString('pt-BR')}
      </div>
    `;
    
    // Adicionar contadores por tipo
    Object.keys(absenceCount).forEach(type => {
      const count = absenceCount[type];
      const typeName = getAbsenceTypeName(type);
      content += `
        <div style="margin-bottom: 8px; display: flex; justify-content: space-between; align-items: center;">
          <span>${typeName}</span>
          <span style="background: rgba(255,255,255,0.3); padding: 2px 8px; border-radius: 12px; font-size: 11px;">${count}</span>
        </div>
      `;
    });
    
    content += `
      <div style="margin-top: 15px; padding-top: 10px; border-top: 1px solid rgba(255,255,255,0.3); font-size: 11px;">
        <strong>Total: ${todayEvents.length} ausencia${todayEvents.length > 1 ? 's' : ''}</strong>
      </div>
      <div style="margin-top: 10px; text-align: right;">
        <button onclick="hideAbsenceSummaryPanel()" style="background: none; border: 1px solid rgba(255,255,255,0.5); color: white; padding: 4px 8px; border-radius: 4px; cursor: pointer; font-size: 10px;">
          Ocultar
        </button>
      </div>
    `;
    
    panel.innerHTML = content;
    
    // Mostrar painel
    setTimeout(() => {
      panel.style.transform = 'translateX(0)';
    }, 100);
    
    // Auto-ocultar após 10 segundos
    setTimeout(() => {
      hideAbsenceSummaryPanel();
    }, 10000);
  }
}

// Função para ocultar o painel
function hideAbsenceSummaryPanel() {
  const panel = document.getElementById('absenceSummaryPanel');
  if (panel) {
    panel.style.transform = 'translateX(100%)';
    setTimeout(() => {
      panel.remove();
    }, 300);
  }
}

// Função para testar manualmente a aplicação de ausencias
function testAbsenceApplication() {
  console.log('=== TESTE DE APLICAÇÃO DE ausenciaS (CALENDÁRIO EXCLUSIVO) ===');
  
  // Obter dados da tabela
  const tableRows = document.querySelectorAll('#tableBody13 tr');
  console.log(`Linhas da tabela encontradas: ${tableRows.length}`);
  
  if (tableRows.length > 0) {
    console.log('Estrutura da primeira linha:');
    const firstRow = tableRows[0];
    const cells = firstRow.cells;
    
    for (let i = 0; i < cells.length; i++) {
      console.log(`Célula ${i}: "${cells[i].textContent.trim()}"`);
    }
    
    // Verificar se há coluna de ausencia
    const ausenciaCell = firstRow.querySelector('.ausencia-select');
    if (ausenciaCell) {
      console.log(`✅ Coluna de ausencia encontrada: "${ausenciaCell.value}" (baseada no calendário)`);
      console.log(`Row index: ${ausenciaCell.getAttribute('data-row-index')}`);
    } else {
      console.log('❌ Coluna de ausencia não encontrada');
    }
  }
  
  // Verificar eventos do calendário
  const events = JSON.parse(localStorage.getItem('calendar_events') || '[]');
  console.log(`\nEventos do calendário: ${events.length}`);
  
  const today = new Date().toISOString().split('T')[0];
  const todayEvents = events.filter(event => {
    const eventDate = new Date(event.date).toISOString().split('T')[0];
    return eventDate === today;
  });
  
  console.log(`Eventos para hoje (${today}): ${todayEvents.length}`);
  
  events.forEach((event, index) => {
    const eventDate = new Date(event.date).toLocaleDateString('pt-BR');
    const isToday = new Date(event.date).toISOString().split('T')[0] === today;
    console.log(`Evento ${index + 1}${isToday ? ' [HOJE]' : ''}: ${event.employeeName} - ${event.absenceType} em ${eventDate}`);
  });
  
  // Verificar correspondência entre eventos e tabela
  console.log('\n--- VERIFICAÇÃO DE CORRESPONDÊNCIAS ---');
  todayEvents.forEach(event => {
    console.log(`\nBuscando na tabela: ${event.employeeName} (ID: ${event.employeeId})`);
    
    let found = false;
    for (let i = 0; i < tableRows.length; i++) {
      const row = tableRows[i];
      const cells = row.cells;
      
      if (cells.length === 0) continue;
      
      const matricula = cells[0] ? cells[0].textContent.trim() : '';
      const colaborador = cells[1] ? cells[1].textContent.trim() : '';
      
      // Verificações de segurança
      const eventEmployeeId = event.employeeId || '';
      const eventEmployeeName = (event.employeeName || '').toLowerCase();
      const colaboradorLower = (colaborador || '').toLowerCase();
      
      if (matricula === eventEmployeeId || 
          colaboradorLower.includes(eventEmployeeName) ||
          eventEmployeeName.includes(colaboradorLower)) {
        
        const ausenciaSelect = row.querySelector('.ausencia-select');
        const ausenciaValue = ausenciaSelect ? ausenciaSelect.value : 'N/A';
        
        console.log(`✅ Encontrado na linha ${i}: ${matricula} - ${colaborador}`);
        console.log(`   ausencia na tabela: "${ausenciaValue}"`);
        console.log(`   ausencia do evento: "${event.absenceType}"`);
        
        found = true;
        break;
      }
    }
    
    if (!found) {
      console.log('❌ Colaborador não encontrado na tabela');
    }
  });
  
  console.log('\n=== FIM DO TESTE ===');
  console.log('💡 As ausencias agora são controladas EXCLUSIVAMENTE pelo calendário');
  console.log('💡 datadash_13.ausencia não é mais utilizado para esta coluna');
}

// Função para verificar e atualizar ausencias periodicamente
function startAbsenceUpdater() {
  // Adicionar funções de teste e relatório ao window para acesso via console
  window.testAbsenceApplication = testAbsenceApplication;
  window.gerarRelatorioAusencias = gerarRelatorioAusencias;
  window.resetarAusenciasCalendario = resetarAusenciasCalendario;
  window.obterDadosAtualizados = obterDadosAtualizados;
  
  // Atualizar imediatamente
  updateTableAbsences();
  
  // Mostrar painel de resumo
  updateAbsenceSummaryPanel();
  
  // Verificar a cada minuto se mudou o dia
  setInterval(() => {
    updateTableAbsences();
  }, 60000); // 60 segundos
  
  console.log('🚀 Sistema de ausencias inicializado (Calendário Exclusivo)');
  console.log('📋 Funções disponíveis no console:');
  console.log('   • testAbsenceApplication() - Teste do sistema');
  console.log('   • gerarRelatorioAusencias() - Relatório detalhado');
  console.log('   • resetarAusenciasCalendario() - Reset completo');
  console.log('   • obterDadosAtualizados() - Status atual');
}

// Função para atualizar ausencias quando um evento é salvo
function updateAbsencesOnEventSave(event) {
  const eventDate = new Date(event.date);
  const today = new Date();
  
  console.log(`Evento salvo: ${event.employeeName} - ${event.absenceType} para ${eventDate.toLocaleDateString('pt-BR')}`);
  
  // Se o evento é para hoje, atualizar a tabela imediatamente
  if (eventDate.toDateString() === today.toDateString()) {
    console.log('Evento é para hoje - atualizando tabela imediatamente');
    refreshTableAbsencesFromCalendar();
    
    // Mostrar notificação específica
    const absenceMap = {
      'folga': 'Folga',
      'ferias': 'Ferias',
      'atestado': 'Atestado',
      'falta': 'Falta'
    };
    const absenceValue = absenceMap[event.absenceType] || event.absenceType;
    showAbsenceNotification(event.employeeName, absenceValue);
  } else {
    console.log(`Evento é para ${eventDate.toLocaleDateString('pt-BR')} - será aplicado automaticamente no dia`);
  }
}

async function saveEvent() {
  const date = selectedDate;
  const employeeInput = document.getElementById('employeeInput');
  const employeeSelect = document.getElementById('employeeSelect');
  const absenceType = document.getElementById('absenceType').value;
  const notes = document.getElementById('eventNotes').value;
  const feriassDuration = document.getElementById('feriassDuration').value;
  const atestadoDuration = document.getElementById('atestadoDuration').value;
  const folgaDuration = document.getElementById('folgaDuration').value;
  
  // Determinar qual campo está sendo usado
  let employeeValue = '';
  let employeeName = '';
  
  if (employeeInput.style.display !== 'none') {
    // Modo input
    employeeValue = employeeInput.value.trim();
    if (!employeeValue) {
      alert('Por favor, digite a matrícula do colaborador.');
      employeeInput.focus();
      return;
    }
    
    // Tentar encontrar o nome do colaborador
    const employees = getEmployeesFromData();
    const foundEmployee = employees.find(emp => 
      emp.matricula === employeeValue || 
      emp.matricula.toString() === employeeValue || 
      emp.nome.toLowerCase().includes(employeeValue.toLowerCase())
    );
    
    if (foundEmployee) {
      employeeName = `${foundEmployee.matricula} - ${foundEmployee.nome}`;
      employeeValue = foundEmployee.matricula.toString();
      console.log(`✅ Colaborador encontrado: ${employeeName}, ID: ${employeeValue}`);
    } else {
      // Se não encontrar, usar o que foi digitado
      employeeName = employeeValue;
      console.log(`⚠️ Colaborador não encontrado na base, usando: ${employeeValue}`);
    }
  } else {
    // Modo select
    employeeValue = employeeSelect.value;
    if (!employeeValue) {
      alert('Por favor, selecione um colaborador.');
      employeeSelect.focus();
      return;
    }
    employeeName = employeeSelect.options[employeeSelect.selectedIndex].textContent;
  }
  
  if (!absenceType) {
    alert('Por favor, selecione o tipo de ausência.');
    document.getElementById('absenceType').focus();
    return;
  }
  
  // Verificar se já existe evento para este colaborador na data selecionada
  function checkExistingEvent(checkDate, employeeId) {
    const checkDateStr = checkDate.toISOString().split('T')[0];
    const existingEvent = calendarEvents.find(event => 
      event.date === checkDateStr && 
      (event.employeeId === employeeId || event.employeeId === employeeId.toString())
    );
    return existingEvent;
  }
  
  // Função auxiliar para criar múltiplos eventos
  async function createMultipleEvents(duration, typeName, typeIcon) {
    let successCount = 0;
    let failCount = 0;
    let skippedCount = 0;
    let conflictDates = [];
    
    console.log(`${typeIcon} Criando ${duration} eventos de ${typeName} a partir de ${date.toLocaleDateString('pt-BR')}`);
    
    // Primeiro, verificar todos os dias para conflitos
    for (let i = 0; i < duration; i++) {
      const eventDate = new Date(date);
      eventDate.setDate(date.getDate() + i);
      
      const existingEvent = checkExistingEvent(eventDate, employeeValue);
      if (existingEvent) {
        conflictDates.push({
          date: eventDate,
          existingType: existingEvent.absenceType,
          dayNumber: i + 1
        });
      }
    }
    
    // Se houver conflitos, perguntar ao usuário
    if (conflictDates.length > 0) {
      const conflictMessage = conflictDates.map(conflict => 
        `• Dia ${conflict.dayNumber} (${conflict.date.toLocaleDateString('pt-BR')}): ${getAbsenceTypeName(conflict.existingType)}`
      ).join('\n');
      
      const userChoice = confirm(`⚠️ CONFLITO DETECTADO!\n\nO colaborador ${employeeName} já possui eventos nos seguintes dias:\n\n${conflictMessage}\n\n${conflictDates.length === duration ? 'TODOS os dias têm conflitos!' : `${conflictDates.length} de ${duration} dias têm conflitos.`}\n\nDeseja continuar criando apenas os eventos nos dias SEM conflito?\n\n• ✅ SIM: Criar eventos apenas nos dias livres\n• ❌ NÃO: Cancelar toda a operação`);
      
      if (!userChoice) {
        alert('❌ Operação cancelada pelo usuário devido a conflitos de datas.');
        return;
      }
    }
    
    for (let i = 0; i < duration; i++) {
      const eventDate = new Date(date);
      eventDate.setDate(date.getDate() + i);
      
      // Verificar se já existe evento para este colaborador nesta data
      const existingEvent = checkExistingEvent(eventDate, employeeValue);
      if (existingEvent) {
        skippedCount++;
        console.log(`⚠️ Pulando dia ${i + 1}/${duration} (${eventDate.toLocaleDateString('pt-BR')}): Colaborador já tem ${getAbsenceTypeName(existingEvent.absenceType)}`);
        continue;
      }
      
      const eventData = {
        date: eventDate.toISOString().split('T')[0],
        employeeId: employeeValue.toString(),
        employeeName: employeeName,
        absenceType: absenceType,
        notes: notes + (duration > 1 ? ` (Dia ${i + 1} de ${duration})` : '')
      };
      
      try {
        const response = await fetch('/eventos', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          credentials: 'include',
          body: JSON.stringify(eventData)
        });
        
        const result = await response.json();
        
        if (response.ok && result.sucesso) {
          successCount++;
          console.log(`✅ Evento de ${typeName} ${i + 1}/${duration} salvo:`, eventDate.toLocaleDateString('pt-BR'));
        } else {
          failCount++;
          console.error(`❌ Erro no evento ${i + 1}/${duration}:`, result.erro);
        }
        
      } catch (error) {
        failCount++;
        console.error(`❌ Erro na requisição do evento ${i + 1}/${duration}:`, error);
      }
    }
    
    // Mostrar resultado final
    if (successCount > 0 || skippedCount > 0) {
      await loadEventsFromServer();
      renderCalendar();
      
      const today = new Date();
      if (date.toDateString() === today.toDateString()) {
        refreshTableAbsencesFromCalendar();
      }
      
      closeEventModal();
      
      let message = '';
      if (successCount > 0 && skippedCount === 0 && failCount === 0) {
        message = `✅ Todos os ${successCount} dias de ${typeName} foram salvos com sucesso!\nPeríodo: ${date.toLocaleDateString('pt-BR')} a ${new Date(date.getTime() + (duration - 1) * 24 * 60 * 60 * 1000).toLocaleDateString('pt-BR')}\nColaborador: ${employeeName}`;
      } else {
        message = `📊 Resultado da operação:\n\n`;
        if (successCount > 0) message += `✅ Salvos com sucesso: ${successCount} dias\n`;
        if (skippedCount > 0) message += `⚠️ Pulados (conflito): ${skippedCount} dias\n`;
        if (failCount > 0) message += `❌ Falharam: ${failCount} dias\n`;
        message += `\nColaborador: ${employeeName}`;
        if (skippedCount > 0) {
          message += `\n\n💡 Dias pulados já tinham outros eventos marcados.`;
        }
      }
      
      alert(message);
    } else {
      alert(`❌ Erro: Não foi possível salvar nenhum evento de ${typeName}.${skippedCount > 0 ? '\n\n⚠️ Todos os dias selecionados já tinham eventos marcados para este colaborador.' : ''}`);
    }
  }
  
  // Verificar se é um tipo que suporta múltiplos dias
  if (absenceType === 'ferias') {
    const duration = parseInt(feriassDuration) || 1;
    await createMultipleEvents(duration, 'férias', '🏖️');
    return;
  } else if (absenceType === 'atestado') {
    const duration = parseInt(atestadoDuration) || 1;
    await createMultipleEvents(duration, 'atestado', '🏥');
    return;
  } else if (absenceType === 'folga') {
    const duration = parseInt(folgaDuration) || 1;
    await createMultipleEvents(duration, 'folga', '🏖️');
    return;
  }
  
  // Criar evento único para outros tipos
  // Verificar se já existe evento para este colaborador nesta data
  const existingEvent = checkExistingEvent(date, employeeValue);
  if (existingEvent) {
    const confirmReplace = confirm(`⚠️ CONFLITO DETECTADO!\n\nO colaborador ${employeeName} já possui um evento em ${date.toLocaleDateString('pt-BR')}:\n\n${getAbsenceTypeName(existingEvent.absenceType)}\n\nDeseja substituir o evento existente?\n\n• ✅ SIM: Substituir o evento existente\n• ❌ NÃO: Cancelar operação`);
    
    if (!confirmReplace) {
      alert('❌ Operação cancelada. O evento existente foi mantido.');
      return;
    }
    
    // Se usuário confirmou, primeiro excluir o evento existente
    try {
      const deleteResponse = await fetch(`/eventos/${existingEvent.id}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json'
        },
        credentials: 'include'
      });
      
      if (!deleteResponse.ok) {
        throw new Error('Erro ao excluir evento existente');
      }
      
      console.log('🗑️ Evento existente excluído com sucesso');
      
      // Recarregar eventos para atualizar a lista local
      await loadEventsFromServer();
      
    } catch (error) {
      console.error('❌ Erro ao excluir evento existente:', error);
      alert('❌ Erro ao excluir o evento existente. Tente novamente.');
      return;
    }
  }
  
  const eventData = {
    date: date.toISOString().split('T')[0], // Apenas a data
    employeeId: employeeValue.toString(),
    employeeName: employeeName,
    absenceType: absenceType,
    notes: notes
  };
  
  console.log('🎯 Salvando evento no servidor:', eventData);
  
  try {
    // Salvar no servidor
    const response = await fetch('/eventos', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
      body: JSON.stringify(eventData)
    });
    
    const result = await response.json();
    
    if (response.ok && result.sucesso) {
      console.log('💾 Evento salvo no servidor com sucesso:', result.evento);
      
      // Recarregar eventos do servidor
      await loadEventsFromServer();
      
      // Atualizar ausências na tabela se for para hoje
      const today = new Date();
      const eventDate = new Date(date);
      if (eventDate.toDateString() === today.toDateString()) {
        console.log('📅 Evento é para hoje - atualizando tabela');
        refreshTableAbsencesFromCalendar();
      }
      
      // Atualizar o calendário
      renderCalendar();
      
      // Atualizar o botão de ação se a data salva é a selecionada
      if (selectedDate && selectedDate.toDateString() === date.toDateString()) {
        updateCalendarActionButton();
      }
      
      // Fechar o modal
      closeEventModal();
      
      // Mostrar confirmação
      alert(`Evento salvo com sucesso!\nData: ${date.toLocaleDateString('pt-BR')}\nColaborador: ${employeeName}\nTipo: ${getAbsenceTypeName(absenceType)}`);
      
    } else {
      console.error('❌ Erro ao salvar evento:', result.erro);
      alert(`Erro ao salvar evento: ${result.erro}`);
    }
    
  } catch (error) {
    console.error('❌ Erro na requisição:', error);
    alert('Erro ao salvar evento. Verifique a conexão com o servidor.');
  }
}

function getAbsenceTypeName(type) {
  const types = {
    'folga': '🏖️ Folga',
    'ferias': '✈️ Ferias',
    'atestado': '🏥 Atestado',
    'falta': '❌ Falta'
  };
  return types[type] || type;
}

// Inicializar verificação de ausencias após carregar a página
// (Removido) Bloco duplicado de DOMContentLoaded — consolidado acima

// Handlers de ESC e clique-fora consolidados anteriormente
// (Removido) Bloco duplicado de DOMContentLoaded — consolidado acima

// Função de debug para testar carregamento de eventos
window.testLoadEvents = async function() {
  console.log('🧪 Teste de carregamento de eventos...');
  console.log('📊 Estado atual calendarEvents:', calendarEvents);
  
  try {
    const eventos = await loadEventsFromServer();
    console.log('✅ Teste concluído - eventos carregados:', eventos);
    console.log('📊 calendarEvents após teste:', calendarEvents);
    return eventos;
  } catch (error) {
    console.error('❌ Erro no teste:', error);
    return [];
  }
};

// Função para verificar endpoint diretamente
window.testEventsEndpoint = async function() {
  console.log('🧪 Testando endpoint /eventos diretamente...');
  
  try {
    const response = await fetch('/eventos', {
      method: 'GET',
      credentials: 'include'
    });
    console.log('📡 Status:', response.status);
    
    const data = await response.json();
    console.log('📋 Dados:', data);
    
    // Filtrar e contar eventos por tipo
    const eventosPorTipo = {};
    data.eventos.forEach(evento => {
      const tipo = evento.absenceType || 'sem_tipo';
      eventosPorTipo[tipo] = (eventosPorTipo[tipo] || 0) + 1;
    });
    
    console.log('📊 Eventos por tipo:', eventosPorTipo);
    
    // Verificar se eventos de férias estão sendo ignorados no backend
    const eventosFerias = data.eventos.filter(e => e.absenceType === 'ferias');
    console.log(`🏖️ Eventos de férias encontrados: ${eventosFerias.length}`);
    console.log('📝 Nota: Eventos de férias NÃO devem ser contados no cálculo de abono');
    
    return data;
  } catch (error) {
    console.error('❌ Erro:', error);
    return null;
  }
};

// Função para testar a criação de múltiplos eventos
window.testMultipleEventsCreation = function() {
  console.log('🧪 Teste da funcionalidade de múltiplos eventos COM VALIDAÇÃO DE CONFLITOS:');
  console.log('=== FÉRIAS ===');
  console.log('1. Abra o calendário clicando no botão "📅"');
  console.log('2. Clique em "➕ Adicionar Evento" ou selecione uma data');
  console.log('3. Selecione um colaborador');
  console.log('4. Escolha "✈️ Férias" como tipo');
  console.log('5. Verifique se o campo "Duração das Férias" apareceu');
  console.log('6. Selecione 20 ou 30 dias');
  console.log('7. Salve o evento');
  console.log('8. Verifique se múltiplos eventos foram criados no calendário');
  console.log('');
  console.log('=== ATESTADO ===');
  console.log('1. Selecione "🏥 Atestado" como tipo');
  console.log('2. Verifique se o campo "Duração do Atestado" apareceu');
  console.log('3. Selecione a quantidade de dias (1-30)');
  console.log('4. Salve o evento');
  console.log('5. Verifique se múltiplos eventos de atestado foram criados');
  console.log('');
  console.log('=== FOLGA ===');
  console.log('1. Selecione "🏖️ Folga" como tipo');
  console.log('2. Verifique se o campo "Duração da Folga" apareceu');
  console.log('3. Selecione a quantidade de dias (1-30)');
  console.log('4. Salve o evento');
  console.log('5. Verifique se múltiplos eventos de folga foram criados');
  console.log('');
  console.log('=== TESTE DE CONFLITOS ===');
  console.log('1. Tente marcar um evento para um colaborador em uma data que já tem evento');
  console.log('2. Observe o aviso de conflito no modal (⚠️ CONFLITO DETECTADO!)');
  console.log('3. Clique em "Ver Evento" para detalhes do evento existente');
  console.log('4. Para substituir, continue com o cadastro atual');
  console.log('5. Para eventos únicos: Confirme se deseja substituir');
  console.log('6. Para múltiplos dias: Escolha se quer pular conflitos ou cancelar');
  console.log('');
  console.log('🔥 NOVAS FUNCIONALIDADES:');
  console.log('• ✅ Apenas 1 evento por pessoa por dia');
  console.log('• ⚠️ Avisos visuais de conflito em tempo real');
  console.log('• 🔄 Opção de substituir eventos existentes');
  console.log('• 📊 Relatório detalhado de conflitos em múltiplos dias');
  console.log('• 👁️ Visualização de eventos existentes antes de substituir');
};

// Manter compatibilidade com função antiga
window.testFeriasCreation = window.testMultipleEventsCreation;

// Função adicional para testar especificamente conflitos
window.testConflictValidation = function() {
  console.log('🧪 TESTE ESPECÍFICO - VALIDAÇÃO DE CONFLITOS:');
  console.log('');
  console.log('📋 Passos para testar:');
  console.log('1. Crie um evento qualquer para um colaborador em uma data');
  console.log('2. Tente criar outro evento para o MESMO colaborador na MESMA data');
  console.log('3. Observe o comportamento:');
  console.log('   • Aviso visual no modal (⚠️ CONFLITO DETECTADO!)');
  console.log('   • Botão "Ver Evento" para detalhes');
  console.log('   • Opção de substituir ou cancelar');
  console.log('');
  console.log('🔄 Cenários para testar:');
  console.log('• Evento único substituindo evento único');
  console.log('• Múltiplos dias com alguns conflitos');
  console.log('• Múltiplos dias com todos os dias em conflito');
  console.log('• Verificação em tempo real ao selecionar colaborador');
  console.log('');
  console.log('✅ Comportamento esperado:');
  console.log('• NUNCA permitir 2+ eventos para mesma pessoa no mesmo dia');
  console.log('• Sempre avisar sobre conflitos ANTES de salvar');
  console.log('• Dar opções claras: substituir, pular ou cancelar');
};

// Função para atualizar todos os dados (botão REFRESH)
async function refreshAllData() {
  console.log('🔄 REFRESH: Iniciando atualização completa dos dados...');
  
  // Mostrar feedback visual de carregamento
  const refreshBtn = document.getElementById('refreshBtn');
  const originalHTML = refreshBtn.innerHTML;
  
  // Animação de loading no botão
  refreshBtn.innerHTML = `
    <svg class="chart-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="animation: spin 1s linear infinite;">
      <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/>
      <path d="M21 3v5h-5"/>
      <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/>
      <path d="M3 21v-5h5"/>
    </svg>
    <div style="display: flex; flex-direction: column; align-items: center;">
      <span style="font-size: 12px; font-weight: 700;">ATUALIZANDO...</span>
      <span style="font-size: 10px; opacity: 0.8;">Aguarde...</span>
    </div>
  `;
  refreshBtn.disabled = true;
  
  // Adicionar estilo de rotação
  const style = document.createElement('style');
  style.textContent = `
    @keyframes spin {
      from { transform: rotate(0deg); }
      to { transform: rotate(360deg); }
    }
  `;
  document.head.appendChild(style);
  
  try {
    // 1. Recarregar dados da API principal
    console.log('🔄 REFRESH: Carregando dados da API...');
    await carregarDadosAPI();
    
    // 2. Atualizar calendário
    console.log('🔄 REFRESH: Atualizando calendário...');
    if (typeof renderCalendar === 'function') {
      renderCalendar();
    }
    
    // 3. Atualizar data atual no header
    console.log('🔄 REFRESH: Atualizando data atual...');
    if (typeof updateCurrentDate === 'function') {
      updateCurrentDate();
    }
    
    // 4. Atualizar sistema de compensação se existir
    console.log('🔄 REFRESH: Atualizando sistema de compensação...');
    if (typeof updateAbsenceSummaryPanel === 'function') {
      updateAbsenceSummaryPanel();
    }
    
    // 5. Atualizar outras tabelas/dashboards
    console.log('🔄 REFRESH: Atualizando tabelas...');
    if (typeof updateTableAbsences === 'function') {
      updateTableAbsences();
    }
    
    console.log('✅ REFRESH: Atualização completa realizada com sucesso!');
    
    // Feedback de sucesso
    refreshBtn.style.background = 'linear-gradient(135deg, #4CAF50, #45a049)';
    refreshBtn.innerHTML = `
      <svg class="chart-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M20 6L9 17l-5-5"/>
      </svg>
      <div style="display: flex; flex-direction: column; align-items: center;">
        <span style="font-size: 12px; font-weight: 700;">ATUALIZADO!</span>
        <span style="font-size: 10px; opacity: 0.8;">Sucesso</span>
      </div>
    `;
    
    // Voltar ao estado normal após 2 segundos
    setTimeout(() => {
      refreshBtn.style.background = 'linear-gradient(135deg, #2196F3, #1976D2)';
      refreshBtn.innerHTML = originalHTML;
      refreshBtn.disabled = false;
      document.head.removeChild(style);
    }, 2000);
    
  } catch (error) {
    console.error('❌ REFRESH: Erro durante atualização:', error);
    
    // Feedback de erro
    refreshBtn.style.background = 'linear-gradient(135deg, #f44336, #d32f2f)';
    refreshBtn.innerHTML = `
      <svg class="chart-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="12" cy="12" r="10"/>
        <line x1="15" y1="9" x2="9" y2="15"/>
        <line x1="9" y1="9" x2="15" y2="15"/>
      </svg>
      <div style="display: flex; flex-direction: column; align-items: center;">
        <span style="font-size: 12px; font-weight: 700;">ERRO!</span>
        <span style="font-size: 10px; opacity: 0.8;">Falha na atualização</span>
      </div>
    `;
    
    // Voltar ao estado normal após 3 segundos
    setTimeout(() => {
      refreshBtn.style.background = 'linear-gradient(135deg, #2196F3, #1976D2)';
      refreshBtn.innerHTML = originalHTML;
      refreshBtn.disabled = false;
      document.head.removeChild(style);
    }, 3000);
    
    // Mostrar erro para o usuário
    alert('Erro ao atualizar os dados. Verifique sua conexão e tente novamente.');
  }
}
