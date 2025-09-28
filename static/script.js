// Toggle global de logs de debug (idempotente) — por padrão, desabilita console.log
(function () {
  if (typeof window === 'undefined' || typeof console === 'undefined') return;
  if (window.__logToggleInit) return; // evita reinicializar
  window.__logToggleInit = true;

  try {
    if (!console.__origLog && typeof console.log === 'function') {
      console.__origLog = console.log.bind(console);
    }

    window.enableDebugLogs = function () {
      if (console.__origLog) console.log = console.__origLog;
      console.__silenced = false;
      window.DEBUG = true;
    };

    window.disableDebugLogs = function () {
      console.log = function () {};
      console.__silenced = true;
      window.DEBUG = false;
    };

    // desabilita por padrão
    window.disableDebugLogs();
  } catch (_) {}
})();

const externalScriptPromises = new Map();

function loadExternalScript(src) {
  if (!src) {
    return Promise.reject(new Error('Fonte do script inválida'));
  }

  if (externalScriptPromises.has(src)) {
    return externalScriptPromises.get(src);
  }

  const existingScript = document.querySelector(`script[src="${src}"]`);
  if (existingScript) {
    if (existingScript.dataset.loaded === 'true') {
      const promise = Promise.resolve();
      externalScriptPromises.set(src, promise);
      return promise;
    }

    const pendingPromise = new Promise((resolve, reject) => {
      function cleanup() {
        existingScript.removeEventListener('load', handleLoad);
        existingScript.removeEventListener('error', handleError);
      }

      function handleLoad() {
        existingScript.dataset.loaded = 'true';
        cleanup();
        resolve();
      }

      function handleError() {
        cleanup();
        externalScriptPromises.delete(src);
        reject(new Error(`Falha ao carregar script: ${src}`));
      }

      existingScript.addEventListener('load', handleLoad, { once: true });
      existingScript.addEventListener('error', handleError, { once: true });
    });

    externalScriptPromises.set(src, pendingPromise);
    return pendingPromise;
  }

  const promise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = src;
    script.async = true;
    script.onload = () => {
      script.dataset.loaded = 'true';
      resolve();
    };
    script.onerror = () => {
      script.remove();
      externalScriptPromises.delete(src);
      reject(new Error(`Falha ao carregar script: ${src}`));
    };
    document.head.appendChild(script);
  });

  externalScriptPromises.set(src, promise);
  return promise;
}

let tabela3Data = null;
let currentCalendarDate = new Date();
let selectedDate = null;
let calendarEvents = [];
let dragonOverlayEnabled = false;
let dragonCurrentTarget = null;
let dragonTargetClearTimeout = null;

const DRAGON_TARGET_BLACKLIST = new Set(['HTML', 'BODY', 'SVG', 'USE']);

function isDragonTargetEligible(node) {
  if (!node || DRAGON_TARGET_BLACKLIST.has(node.tagName)) return false;
  if (node.closest && node.closest('svg')) return false;
  return true;
}

function clearDragonTarget(immediate = false) {
  if (dragonTargetClearTimeout) {
    clearTimeout(dragonTargetClearTimeout);
    dragonTargetClearTimeout = null;
  }

  const remove = () => {
    if (dragonCurrentTarget) {
      dragonCurrentTarget.classList.remove('dragon-scan-target');
      dragonCurrentTarget = null;
    }
  };

  if (immediate) {
    remove();
  } else {
    dragonTargetClearTimeout = setTimeout(remove, 140);
  }
}

function highlightDragonTarget(clientX, clientY) {
  if (!dragonOverlayEnabled) {
    clearDragonTarget(true);
    return;
  }

  const target = document.elementFromPoint(clientX, clientY);
  if (!isDragonTargetEligible(target)) {
    clearDragonTarget();
    return;
  }

  if (target !== dragonCurrentTarget) {
    if (dragonCurrentTarget) {
      dragonCurrentTarget.classList.remove('dragon-scan-target');
    }
    dragonCurrentTarget = target;
    dragonCurrentTarget.classList.add('dragon-scan-target');
  }
}

const MESES_REFERENCIA = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
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
    MESES_REFERENCIA.forEach((mes) => {
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
      body: JSON.stringify(payload),
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

function setDragonOverlayState(enabled) {
  dragonOverlayEnabled = !!enabled;
  const body = document.body;
  if (body) {
    body.classList.toggle('dragon-overlay', dragonOverlayEnabled);
  }

  window.isDragonOverlayActive = () => dragonOverlayEnabled;

  const toggleBtn = document.getElementById('dragonToggleBtn');
  if (toggleBtn) {
    toggleBtn.setAttribute('aria-pressed', String(dragonOverlayEnabled));
    toggleBtn.classList.toggle('is-active', dragonOverlayEnabled);
  }

  const stateLabel = document.getElementById('dragonToggleState');
  if (stateLabel) {
    stateLabel.textContent = dragonOverlayEnabled ? 'Destaque' : 'Fundo';
  }

  if (!dragonOverlayEnabled) {
    clearDragonTarget(true);
  }
}

function toggleDragonOverlay(forceState) {
  const desired = typeof forceState === 'boolean' ? forceState : !dragonOverlayEnabled;
  setDragonOverlayState(desired);
}

window.syncMesOverrideSelect = syncMesOverrideSelect;
window.toggleDragonOverlay = toggleDragonOverlay;

// Função para carregar dados da API
async function carregarDadosAPI() {
  try {
    console.log('🚀 Iniciando carregamento dos dados da API...');
    const response = await fetch('/tabelas', {
      method: 'GET',
      credentials: 'include',
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

    if (data.tabela_3) {
      console.log('✅ tabela_3 encontrada na resposta');
      console.log('📋 Tipo da tabela_3:', typeof data.tabela_3);
      console.log('📋 É array?', Array.isArray(data.tabela_3));
      console.log(
        '📋 Tamanho/propriedades:',
        Array.isArray(data.tabela_3) ? data.tabela_3.length : Object.keys(data.tabela_3).length
      );

      tabela3Data = data.tabela_3;
      console.log('💾 Dados da tabela_3 armazenados globalmente:', tabela3Data);
    } else {
      console.warn('⚠️ tabela_3 não encontrada na resposta da API');
      console.log('📋 Propriedades disponíveis:', Object.keys(data));
      tabela3Data = null;
    }

    console.log('🔄 Iniciando carregamento de eventos...');
    await loadEventsFromServer();
    console.log('✅ Carregamento de eventos concluído');
    console.log('📊 calendarEvents após await:', calendarEvents ? calendarEvents.length : 'undefined');

    atualizarCards(data.dados_da_pagina);
    atualizarTabelas(data);

    setTimeout(() => {
      if (typeof renderCalendar === 'function') {
        console.log('🔄 Renderizando calendário com eventos carregados...');
        renderCalendar();
      }
    }, 100);

    setTimeout(() => {
      if (data.tabela_3) {
        console.log('🔄 Aplicando ausências na tabela após carregamento...');
        atualizarAusenciasNaTabela(data.tabela_3);
      }
    }, 500);

    console.log('✅ Dados carregados da API com sucesso');
  } catch (error) {
    console.error('❌ Erro ao carregar dados da API:', error);
    console.log('🔄 Tentando novamente em 3 segundos...');

    setTimeout(() => {
      console.log('🔄 Segunda tentativa de carregamento...');
      carregarDadosAPI();
    }, 3000);
  }
}

function verificarDadosCarregados() {
  const status = {
    tabela3Data: tabela3Data !== null,
    tipoTabela3: typeof tabela3Data,
    isArray: Array.isArray(tabela3Data),
    tamanho: tabela3Data
      ? Array.isArray(tabela3Data)
        ? tabela3Data.length
        : Object.keys(tabela3Data).length
      : 0,
    eventos: calendarEvents ? calendarEvents.length : 0,
  };

  console.log('📊 Status dos dados carregados:', status);
  return status;
}

window.syncTabela3Data = function (data) {
  console.log('🔄 Sincronizando dados da tabela_3 via window.syncTabela3Data...', data);
  tabela3Data = data;
  console.log('✅ tabela3Data atualizada globalmente:', tabela3Data);

  const event = new CustomEvent('tabela3DataLoaded', { detail: data });
  window.dispatchEvent(event);
};

function atualizarCards(dadosPagina) {
  document.getElementById('Total_a_receber').innerText =
    dadosPagina.Total_a_receber.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  document.getElementById('Total_de_Abono').innerText =
    dadosPagina.Total_abonado.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  document.getElementById('Total_de_colaboradores_a_receber').innerText = dadosPagina.Total_de_colaboradores_a_receber;
  document.getElementById('Total_de_colaboradores_com_abono').innerText = dadosPagina.Total_de_colaboradores_com_abono;
}

function atualizarTabelas(data) {
  console.log('📊 Dados recebidos no script.js:', data);

  if (!tabela3Data && data.tabela_3) {
    console.log('🔄 Sincronizando dados da tabela_3 no script.js...');
    tabela3Data = data.tabela_3;
    console.log('✅ Dados da tabela_3 sincronizados:', tabela3Data);
  }

  if (data.data_atual) {
    console.log(`📅 Data atual do servidor: ${data.data_atual}`);
  }

  if (data.total_ausentes !== undefined) {
    console.log(`👥 Total de colaboradores ausentes hoje: ${data.total_ausentes}`);

    const ausentesIndicator = document.getElementById('ausentes-hoje');
    if (ausentesIndicator) {
      ausentesIndicator.textContent = data.total_ausentes;
    }

    if (typeof addAbsenceIndicators === 'function') {
      addAbsenceIndicators(data.total_ausentes);
    }
  }

  if (data.tabela_3 && Array.isArray(data.tabela_3)) {
    const ausentes = data.tabela_3.filter((colaborador) => colaborador.estaAusente);
    if (ausentes.length > 0) {
      console.log(
        '👥 Detalhes dos colaboradores ausentes:',
        ausentes.map((col) => ({
          matricula: col.Matrícula,
          nome: col.Colaborador,
          tipo: col.statusAusencia,
        }))
      );
    }

    atualizarAusenciasNaTabela(data.tabela_3);
  }

  if (window.syncTabela3Data) {
    window.syncTabela3Data(data.tabela_3);
  }

  if (typeof window.renderApiTables === 'function') {
    window.renderApiTables(data);
  }
}

function atualizarAusenciasNaTabela(dadosTabela3) {
  console.log('🔄 Atualizando ausências na tabela visual...');

  dadosTabela3.forEach((colaborador) => {
    const matricula = colaborador.Matrícula;

    const selectAusencia = document.querySelector(`select[data-matricula="${matricula}"]`);

    if (selectAusencia) {
      if (colaborador.estaAusente && colaborador.statusAusencia) {
        const tipoMap = {
          folga: 'Folga',
          ferias: 'Ferias',
          atestado: 'Atestado',
          falta: 'Falta',
        };

        const valorSelect = tipoMap[colaborador.statusAusencia] || colaborador.statusAusencia;
        selectAusencia.value = valorSelect;

        console.log(`✅ Ausência definida para ${matricula} - ${colaborador.Colaborador}: ${valorSelect}`);
      } else {
        selectAusencia.value = '';
      }
    }
  });

  console.log('✅ Atualização de ausências na tabela concluída');
}

function getTabela3Data() {
  console.log('🔍 Verificando tabela3Data:', {
    tipo: typeof tabela3Data,
    isNull: tabela3Data === null,
    isUndefined: tabela3Data === undefined,
    isArray: Array.isArray(tabela3Data),
    length: tabela3Data
      ? Array.isArray(tabela3Data)
        ? tabela3Data.length
        : Object.keys(tabela3Data).length
      : 0,
    valor: tabela3Data,
  });

  if (tabela3Data === null || tabela3Data === undefined) {
    console.warn('⚠️ tabela3Data é null ou undefined - dados não foram carregados da API');
    console.log('🔄 Tentando recarregar dados...');
    carregarDadosAPI();
    return [];
  }

  if (Array.isArray(tabela3Data) && tabela3Data.length > 0) {
    console.log('✅ Retornando dados como array com', tabela3Data.length, 'elementos');
    return tabela3Data;
  }

  if (Array.isArray(tabela3Data) && tabela3Data.length === 0) {
    console.warn('⚠️ tabela3Data é um array vazio');
    return [];
  }

  if (typeof tabela3Data === 'object' && Object.keys(tabela3Data).length > 0) {
    console.log('✅ Retornando dados como objeto com', Object.keys(tabela3Data).length, 'propriedades');
    return tabela3Data;
  }

  console.warn('⚠️ Dados da API tabela_3 não estão disponíveis ou estão vazios');
  return [];
}

function carregarDadosSalvos() {
  console.log('Ausências agora são controladas exclusivamente pelo calendário');
}

function salvarDadosAusencias() {
  try {
    console.log('✅ Ausências são gerenciadas pelo servidor - dados persistidos automaticamente');
  } catch (error) {
    console.error('Erro ao processar dados:', error);
  }
}

function resetarDadosSalvos() {
  if (
    confirm(
      'Tem certeza que deseja recarregar os dados do servidor? Esta ação irá atualizar todas as informações.'
    )
  ) {
    carregarDadosAPI();

    if (confirm('Deseja recarregar a página para garantir que todas as alterações sejam aplicadas?')) {
      location.reload();
    }
  }
}

function exportarDadosAtuais() {
  try {
    fetch('/tabelas', {
      method: 'GET',
      credentials: 'include',
    })
      .then((response) => response.json())
      .then((data) => {
        const wb = XLSX.utils.book_new();

        const applySheetStyles = (ws) => {
          if (!ws || !ws['!ref']) return;

          const range = XLSX.utils.decode_range(ws['!ref']);

          for (let R = range.s.r; R <= range.e.r; ++R) {
            for (let C = range.s.c; C <= range.e.c; ++C) {
              const cellAddress = XLSX.utils.encode_cell({ c: C, r: R });

              if (!ws[cellAddress]) {
                ws[cellAddress] = { t: 's', v: '' };
              }

              if (!ws[cellAddress].s) {
                ws[cellAddress].s = {};
              }

              ws[cellAddress].s = {
                alignment: { horizontal: 'center', vertical: 'center' },
                border: {
                  top: { style: 'thin', color: { rgb: 'FF000000' } },
                  bottom: { style: 'thin', color: { rgb: 'FF000000' } },
                  left: { style: 'thin', color: { rgb: 'FF000000' } },
                  right: { style: 'thin', color: { rgb: 'FF000000' } },
                },
              };

              if (R === 0) {
                ws[cellAddress].s.fill = {
                  fgColor: { rgb: 'FFD3D3D3' },
                };
              }
            }
          }
        };

        const toRows = (obj) => {
          if (!obj) return [];
          if (Array.isArray(obj)) return obj;
          const keys = Object.keys(obj);
          if (keys.length === 0) return [];
          const len = Math.max(
            ...keys.map((k) => (Array.isArray(obj[k]) ? obj[k].length : 0)),
            0
          );
          const rows = [];
          for (let i = 0; i < len; i++) {
            const row = {};
            keys.forEach((k) => {
              row[k] = Array.isArray(obj[k]) ? obj[k][i] : obj[k];
            });
            rows.push(row);
          }
          return rows;
        };

        const topSaldoRows = toRows(data.top_saldo);
        if (topSaldoRows.length > 0) {
          const wsTopSaldo = XLSX.utils.json_to_sheet(topSaldoRows);
          applySheetStyles(wsTopSaldo);
          XLSX.utils.book_append_sheet(wb, wsTopSaldo, 'Top_Saldo');
        }

        const topReceberRows = toRows(data.top_receber);
        if (topReceberRows.length > 0) {
          const wsTopReceber = XLSX.utils.json_to_sheet(topReceberRows);
          applySheetStyles(wsTopReceber);
          XLSX.utils.book_append_sheet(wb, wsTopReceber, 'Top_Receber');
        }

        if (data.relatorio_geral) {
          const wsRelatorioGeral = XLSX.utils.json_to_sheet(data.relatorio_geral);
          applySheetStyles(wsRelatorioGeral);
          XLSX.utils.book_append_sheet(wb, wsRelatorioGeral, 'Relatorio_Geral');
        }

        if (data.mes_proximo) {
          const wsMesProximo = XLSX.utils.json_to_sheet([{ mes_proximo: data.mes_proximo }]);
          applySheetStyles(wsMesProximo);
          XLSX.utils.book_append_sheet(wb, wsMesProximo, 'Mes_Proximo');
        }

        if (data.dados_da_pagina) {
          const wsDadosPagina = XLSX.utils.json_to_sheet([data.dados_da_pagina]);
          applySheetStyles(wsDadosPagina);
          XLSX.utils.book_append_sheet(wb, wsDadosPagina, 'Dados_Pagina');
        }

        if (data.tabela_3) {
          const wsTabela3 = XLSX.utils.json_to_sheet(data.tabela_3);
          applySheetStyles(wsTabela3);
          XLSX.utils.book_append_sheet(wb, wsTabela3, 'Tabela_3');
        }

        if (data.data_atual) {
          const wsDataAtual = XLSX.utils.json_to_sheet([{ data_atual: data.data_atual }]);
          applySheetStyles(wsDataAtual);
          XLSX.utils.book_append_sheet(wb, wsDataAtual, 'Data_Atual');
        }

        if (data.total_ausentes !== undefined) {
          const wsTotalAusentes = XLSX.utils.json_to_sheet([{ total_ausentes: data.total_ausentes }]);
          applySheetStyles(wsTotalAusentes);
          XLSX.utils.book_append_sheet(wb, wsTotalAusentes, 'Total_Ausentes');
        }

        const filename = `banco_horas_dados_${new Date().toISOString().split('T')[0]}.xlsx`;
        XLSX.writeFile(wb, filename, { bookType: 'xlsx' });

        console.log('✅ Dados exportados com sucesso:', filename);
      })
      .catch((error) => {
        console.error('❌ Erro ao buscar dados da API:', error);
        alert('Erro ao exportar dados. Verifique o console para mais detalhes.');
      });
  } catch (error) {
    console.error('❌ Erro ao exportar dados:', error);
    alert('Erro ao exportar dados. Verifique o console para mais detalhes.');
  }
}

carregarDadosSalvos();

function calcularCompensacao() {
  const today = new Date();
  const todayStr = today.toISOString().split('T')[0];

  const contadores = {
    folga: 0,
    ferias: 0,
    atestado: 0,
    falta: 0,
  };

  const todayEvents = (calendarEvents || []).filter((event) => {
    const eventDate = new Date(event.date);
    const eventDateStr = eventDate.toISOString().split('T')[0];
    return eventDateStr === todayStr;
  });

  todayEvents.forEach((event) => {
    const absenceType = event.absenceType ? event.absenceType.toLowerCase() : '';

    if (absenceType === 'folga') contadores.folga++;
    else if (absenceType === 'ferias') contadores.ferias++;
    else if (absenceType === 'atestado') contadores.atestado++;
    else if (absenceType === 'falta') contadores.falta++;
  });

  if (window.DEBUG) console.log(`📊 Contadores de ausências para hoje (${todayStr}):`, contadores);
  return contadores;
}

function refreshTableAbsencesFromCalendar() {
  if (window.DEBUG) console.log('🔄 Atualizando tabela com eventos do calendário...');

  const dadosTabela3 = getTabela3Data();
  if (dadosTabela3 && dadosTabela3.length > 0) {
    const temAusenciasAPI = dadosTabela3.some((item) => item.estaAusente);
    if (temAusenciasAPI) {
      console.log('✅ Dados da API já contêm ausências, mantendo valores atuais');
      return;
    }
  }

  const today = new Date();
  const todayStr = today.toISOString().split('T')[0];
  const events = calendarEvents || [];
  const todayEvents = events.filter((event) => {
    const eventDate = new Date(event.date);
    const eventDateStr = eventDate.toISOString().split('T')[0];
    return eventDateStr === todayStr;
  });

  if (window.DEBUG) console.log(`🔎 ${todayEvents.length} eventos encontrados para hoje (${todayStr})`);

  if (todayEvents.length === 0) {
    console.log('⚠️ Nenhum evento para hoje, mantendo valores atuais da tabela');
    return;
  }

  const ausenciaSelects = document.querySelectorAll('.ausencia-select');

  ausenciaSelects.forEach((select) => {
    const rowIndex = select.getAttribute('data-row-index');

    let matricula = '';
    let colaborador = '';

    if (dadosTabela3 && dadosTabela3[rowIndex]) {
      matricula = (dadosTabela3[rowIndex].Matrícula || '').toString();
      colaborador = dadosTabela3[rowIndex].Colaborador || '';
    }

    const event = todayEvents.find((event) => {
      const eventEmployeeId = (event.employeeId || '').toString();
      return eventEmployeeId === matricula;
    });

    if (event) {
      const absenceMap = {
        folga: 'Folga',
        ferias: 'Ferias',
        atestado: 'Atestado',
        falta: 'Falta',
      };

      const absenceValue = absenceMap[event.absenceType] || event.absenceType;

      if (select.value !== absenceValue) {
        select.value = absenceValue;
        select.classList.remove('folga', 'falta', 'ferias', 'atestado');
        if (absenceValue) {
          select.classList.add(absenceValue.toLowerCase());
        }

        if (window.DEBUG) {
          console.log(
            `✅ Ausência atualizada: ${matricula} - ${colaborador} → ${absenceValue}`
          );
        }
      }
    }
  });
}

function mostrarFeedbackSalvamento() {
  const existingFeedback = document.querySelector('.save-feedback');
  if (existingFeedback) {
    existingFeedback.remove();
  }

  const feedbackDiv = document.createElement('div');
  feedbackDiv.className = 'save-feedback';
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

  setTimeout(() => {
    if (feedbackDiv.parentNode) {
      feedbackDiv.style.animation = 'slideUpFade 0.3s ease';
      setTimeout(() => {
        feedbackDiv.remove();
      }, 300);
    }
  }, 2000);
}

function atualizarModalCompensacao() {
  const modal = document.getElementById('compensacaoModal');
  if (modal && modal.classList.contains('show')) {
    openCompensacaoModal();
  }
}

function gerarRelatorioAusencias() {
  const events = calendarEvents || [];
  const today = new Date();
  const eventosPorMes = {};

  events.forEach((event) => {
    const eventDate = new Date(event.date);
    const mesAno = `${eventDate.getFullYear()}-${String(eventDate.getMonth() + 1).padStart(2, '0')}`;

    if (!eventosPorMes[mesAno]) {
      eventosPorMes[mesAno] = {
        folga: 0,
        ferias: 0,
        atestado: 0,
        falta: 0,
        eventos: [],
      };
    }

    const tipo = event.absenceType || 'outros';
    if (eventosPorMes[mesAno][tipo] !== undefined) {
      eventosPorMes[mesAno][tipo]++;
    }

    eventosPorMes[mesAno].eventos.push(event);
  });

  if (window.DEBUG) {
    console.log('📊 RELATÓRIO DETALHADO DE AUSÊNCIAS (CALENDÁRIO)');
    console.log('='.repeat(50));
  }

  Object.keys(eventosPorMes)
    .sort()
    .forEach((mesAno) => {
      const dados = eventosPorMes[mesAno];
      const [ano, mes] = mesAno.split('-');
      const nomesMeses = [
        'Janeiro',
        'Fevereiro',
        'Março',
        'Abril',
        'Maio',
        'Junho',
        'Julho',
        'Agosto',
        'Setembro',
        'Outubro',
        'Novembro',
        'Dezembro',
      ];
      const nomeMes = nomesMeses[parseInt(mes, 10) - 1];

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

async function resetarAusenciasCalendario() {
  if (
    confirm(
      'Tem certeza que deseja resetar TODOS os eventos do calendário? Esta ação removerá todas as ausências registradas no servidor e não pode ser desfeita.'
    )
  ) {
    try {
      console.log('⚠️ Função de reset completo do servidor não implementada ainda');

      calendarEvents = [];
      window.calendarEvents = [];

      await loadEventsFromServer();
      await carregarDadosAPI();

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
        <div style="font-size: 24px; margin-bottom: 10px;">🔥</div>
        <strong>Eventos recarregados do servidor!</strong><br>
        <small>Calendário e tabela atualizados</small>
      `;

      document.body.appendChild(notification);

      setTimeout(() => {
        notification.remove();
      }, 3000);

      console.log('🔥 Eventos recarregados do servidor');
    } catch (error) {
      console.error('❌ Erro ao resetar eventos:', error);
      alert('Erro ao resetar eventos. Verifique a conexão com o servidor.');
    }
  }
}

function obterDadosAtualizados() {
  const events = calendarEvents || [];
  const today = new Date();

  return {
    eventos: events,
    totalEventos: events.length,
    contadores: calcularCompensacao(),
    eventosHoje: events.filter((event) => {
      const eventDate = new Date(event.date);
      return eventDate.toDateString() === today.toDateString();
    }).length,
    eventosFuturos: events.filter((event) => {
      const eventDate = new Date(event.date);
      return eventDate > today;
    }).length,
    dataSource: 'server_api',
  };
}

function resetarAusencias() {
  if (confirm('Tem certeza que deseja resetar todas as ausencias para "Vazio"? Esta alteração será salva permanentemente.')) {
    const selects = document.querySelectorAll('.ausencia-select');
    selects.forEach((select) => {
      select.value = '';
      select.classList.remove('folga', 'falta', 'ferias', 'atestado');
    });

    salvarDadosAusencias();
    atualizarModalCompensacao();
    mostrarFeedbackSalvamento();

    console.log('Todas as ausencias foram resetadas para vazio e salvas');
  }
}

function openCompensacaoModal() {
  const modal = document.getElementById('compensacaoModal');
  const compensacaoData = document.getElementById('compensacaoData');
  const totalCompensacao = document.getElementById('totalCompensacao');

  if (!modal || !compensacaoData || !totalCompensacao) {
    return;
  }

  const dados = calcularCompensacao();
  const total = dados.folga + dados.ferias + dados.atestado + dados.falta;

  const events = calendarEvents || [];
  const today = new Date();
  const todayStr = today.toISOString().split('T')[0];

  if (events.length === 0) {
    loadEventsFromServer().then(() => {
      setTimeout(() => openCompensacaoModal(), 100);
    });
    return;
  }

  const todayEventsList = events.filter((event) => {
    const eventDate = new Date(event.date).toISOString().split('T')[0];
    return eventDate === todayStr;
  });
  const todayEvents = todayEventsList.length;

  const futureEvents = events.filter((event) => {
    const eventDate = new Date(event.date);
    return eventDate > today;
  }).length;

  const pastEvents = events.filter((event) => {
    const eventDate = new Date(event.date);
    return eventDate < today;
  }).length;

  const uniqueEmployeesToday = new Set(
    todayEventsList.map((event) => event.employeeId || event.employeeName || 'desconhecido')
  ).size;

  const last7DaysStart = new Date(today);
  last7DaysStart.setDate(last7DaysStart.getDate() - 6);
  const last7DaysStartStr = last7DaysStart.toISOString().split('T')[0];
  const last7DaysEvents = events.filter((event) => event.date >= last7DaysStartStr && event.date <= todayStr);
  const last7DaysCounters = last7DaysEvents.reduce(
    (acc, event) => {
      const type = (event.absenceType || '').toLowerCase();
      if (acc[type] !== undefined) {
        acc[type]++;
      }
      return acc;
    },
    { folga: 0, ferias: 0, atestado: 0, falta: 0 }
  );
  const totalLast7Days = last7DaysEvents.length;
  const averagePerDay = totalLast7Days / 7;

  const futureRangeEnd = new Date(today);
  futureRangeEnd.setDate(futureRangeEnd.getDate() + 30);
  const futureRangeEndStr = futureRangeEnd.toISOString().split('T')[0];
  const next30DaysEvents = events.filter((event) => event.date > todayStr && event.date <= futureRangeEndStr);
  const uniqueNext30DaysEmployees = new Set(
    next30DaysEvents.map((event) => event.employeeId || event.employeeName || 'desconhecido')
  ).size;

  const upcomingEvents = events
    .filter((event) => event.date > todayStr)
    .sort((a, b) => new Date(a.date) - new Date(b.date))
    .slice(0, 5);

  const nextEventLabel = upcomingEvents.length > 0
    ? new Date(upcomingEvents[0].date + 'T00:00:00').toLocaleDateString('pt-BR', {
        weekday: 'short',
        day: '2-digit',
        month: 'short',
      })
    : 'Nenhum';

  const tendenciaTexto = (() => {
    if (total === 0 && totalLast7Days === 0) {
      return 'Fluxo normal';
    }
    if (total > averagePerDay + 0.5) {
      return 'Acima da média semanal';
    }
    if (total < averagePerDay - 0.5) {
      return 'Abaixo da média semanal';
    }
    return 'Dentro da média semanal';
  })();

  const distribuicaoPercentual = (tipoValor) => {
    if (!total) return 0;
    return Math.round((tipoValor / total) * 100);
  };

  const absenceCards = [
    {
      type: 'folga',
      icon: '🏖️',
      title: 'Folga',
      subtitle: 'Dias de descanso (hoje)',
      value: dados.folga,
    },
    {
      type: 'ferias',
      icon: '✈️',
      title: 'Férias',
      subtitle: 'Período de descanso (hoje)',
      value: dados.ferias,
    },
    {
      type: 'atestado',
      icon: '🏥',
      title: 'Atestado',
      subtitle: 'Licença médica (hoje)',
      value: dados.atestado,
    },
    {
      type: 'falta',
      icon: '⚠️',
      title: 'Falta',
      subtitle: 'Ausência não justificada (hoje)',
      value: dados.falta,
    },
  ];

  const summaryStats = [
    { label: 'Hoje', value: todayEvents, accent: 'primary' },
    { label: 'Futuros', value: futureEvents, accent: 'info' },
    { label: 'Passados', value: pastEvents, accent: 'muted' },
    { label: 'Total Geral', value: events.length, accent: 'success' },
  ];

  const distributionData = [
    { label: 'Folga', value: dados.folga, className: 'folga' },
    { label: 'Férias', value: dados.ferias, className: 'ferias' },
    { label: 'Atestado', value: dados.atestado, className: 'atestado' },
    { label: 'Falta', value: dados.falta, className: 'falta' },
  ];

  const formatEventDate = (event) => {
    const eventDate = new Date(event.date + 'T00:00:00');
    const dayLabel = eventDate.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
    const weekDay = eventDate.toLocaleDateString('pt-BR', { weekday: 'short' });
    return { dayLabel, weekDay };
  };

  compensacaoData.innerHTML = `
    <header class="compensacao-heading">
      <div class="compensacao-heading-icon">📅</div>
      <div class="compensacao-heading-content">
        <h4>Ausências de hoje</h4>
        <span>${today.toLocaleDateString('pt-BR')}</span>
      </div>
    </header>

    <section class="compensacao-grid">
      ${absenceCards
        .map(
          (card) => `
        <article class="compensacao-item ${card.type}">
          <div class="compensacao-item-header">
            <div class="compensacao-icon">${card.icon}</div>
            <div class="compensacao-info">
              <h3 class="compensacao-title">${card.title}</h3>
              <p class="compensacao-subtitle">${card.subtitle}</p>
            </div>
          </div>
          <div class="compensacao-count">${card.value}</div>
        </article>
      `
        )
        .join('')}
    </section>

    <section class="compensacao-summary">
      <div class="summary-header">
        <h4>📊 Estatísticas gerais do calendário</h4>
        <span>Atualizado automaticamente</span>
      </div>
      <div class="summary-grid">
        ${summaryStats
          .map(
            (stat) => `
          <div class="summary-stat summary-stat--${stat.accent}">
            <strong>${stat.value}</strong>
            <span>${stat.label}</span>
          </div>
        `
          )
          .join('')}
      </div>
    </section>

    <section class="compensacao-insights">
      <div class="insight-card">
        <span class="insight-label">Eventos (7 dias)</span>
        <span class="insight-value">${totalLast7Days}</span>
        <span class="insight-sub">Média diária ${averagePerDay.toFixed(1)} / ${last7DaysCounters.falta} faltas</span>
      </div>
      <div class="insight-card">
        <span class="insight-label">Agenda (30 dias)</span>
        <span class="insight-value">${next30DaysEvents.length}</span>
        <span class="insight-sub">${
          next30DaysEvents.length
            ? `Próx. ${nextEventLabel} • ${uniqueNext30DaysEmployees} colab.`
            : 'Sem eventos agendados'
        }</span>
      </div>
      <div class="insight-card">
        <span class="insight-label">Impacto hoje</span>
        <span class="insight-value">${uniqueEmployeesToday}</span>
        <span class="insight-sub">Colaboradores únicos</span>
      </div>
    </section>

    <section class="compensacao-distribution">
      <div class="distribution-header">
        <h4>Distribuição das ausências hoje</h4>
        <span>${
          total ? `Baseado em ${total} eventos` : 'Sem eventos registrados hoje'
        }</span>
      </div>
      <div class="distribution-list">
        ${distributionData
          .map(
            (item) => `
          <div class="distribution-item">
            <div class="distribution-meta">
              <span>${item.label}</span>
              <span>${item.value} (${distribuicaoPercentual(item.value)}%)</span>
            </div>
            <div class="distribution-bar">
              <div class="bar ${item.className}" style="width: ${distribuicaoPercentual(item.value)}%;"></div>
            </div>
          </div>
        `
          )
          .join('')}
      </div>
    </section>

    <section class="compensacao-upcoming">
      <div class="upcoming-header">
        <h4>Próximas ausências programadas</h4>
        <span>${
          upcomingEvents.length
            ? `${upcomingEvents.length} registro${upcomingEvents.length > 1 ? 's' : ''}`
            : 'Nenhum evento futuro'
        }</span>
      </div>
      ${
        upcomingEvents.length
          ? `
        <ul class="upcoming-list">
          ${upcomingEvents
            .map((event) => {
              const { dayLabel, weekDay } = formatEventDate(event);
              const employee = event.employeeName || 'Colaborador não informado';
              const tipo =
                typeof getAbsenceTypeName === 'function'
                  ? getAbsenceTypeName(event.absenceType)
                  : event.absenceType || 'Ausência';
              return `
              <li class="upcoming-item">
                <div class="upcoming-date">
                  <span class="weekday">${weekDay}</span>
                  <span class="day">${dayLabel}</span>
                </div>
                <div class="upcoming-info">
                  <strong>${employee}</strong>
                  <small>${tipo}</small>
                </div>
              </li>
            `;
            })
            .join('')}
        </ul>
      `
          : `
        <div class="upcoming-empty">☀️ Sem ausências futuras cadastradas</div>
      `
      }
    </section>
  `;

  totalCompensacao.innerHTML = `
    <div class="total-compensacao-wrapper">
      <strong>Total de ausências Hoje: ${total} evento${total !== 1 ? 's' : ''}</strong>
      <span>Colaboradores impactados: ${uniqueEmployeesToday}</span>
      <span>${tendenciaTexto}</span>
      <small>💾 Dados baseados no calendário • Última atualização: ${new Date().toLocaleString('pt-BR')}</small>
    </div>
  `;

  modal.style.display = '';
  modal.classList.add('show');

  setTimeout(() => {
    const items = document.querySelectorAll('.compensacao-item');
    items.forEach((item, index) => {
      setTimeout(() => {
        item.classList.add('animate__animated', 'animate__fadeInUp');
      }, index * 150);
    });
  }, 300);
}

function closeModal() {
  const modal = document.getElementById('compensacaoModal');

  if (!modal) {
    return;
  }

  modal.classList.remove('show');
  setTimeout(() => {
    if (!modal.classList.contains('show')) {
      modal.style.display = 'none';
    }
  }, 100);

  setTimeout(() => {
    const items = document.querySelectorAll('.compensacao-item');
    items.forEach((item) => {
      item.classList.remove('animate__animated', 'animate__fadeInUp');
    });
  }, 500);
}

function getAbsenceTypeName(type) {
  const types = {
    folga: '🏖️ Folga',
    ferias: '✈️ Ferias',
    atestado: '🏥 Atestado',
    falta: '❌ Falta',
  };
  return types[type] || type;
}

function updateCurrentDate() {
  const now = new Date();
  const options = {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  };
  const dateString = now.toLocaleDateString('pt-BR', options);
  const currentDateElement = document.getElementById('currentDate');
  if (currentDateElement) {
    currentDateElement.textContent = dateString;
  }
}

document.addEventListener('DOMContentLoaded', async function () {
  const modalIds = ['compensacaoModal', 'eventModal', 'calendarModal', 'calendarOptionsModal'];
  modalIds.forEach((modalId) => {
    const modal = document.getElementById(modalId);
    if (modal) {
      modal.classList.remove('show');
      modal.style.display = 'none';
    }
  });

  updateCurrentDate();
  setInterval(updateCurrentDate, 60000);

  try {
    await ensureCalendarModuleLoaded();
  } catch (error) {
    console.error('Falha ao carregar módulo do calendário:', error);
  }

  if (typeof addIndicatorStyles === 'function') {
    try {
      addIndicatorStyles();
    } catch (error) {
      console.error('Falha ao aplicar estilos de indicadores:', error);
    }
  }

  try {
    await carregarDadosAPI();
    if (typeof renderCalendar === 'function') {
      setTimeout(() => renderCalendar(), 200);
    }
  } catch (error) {
    console.error('Erro durante carregamento inicial da API:', error);
  }

  setTimeout(() => {
    if (typeof startAbsenceUpdater === 'function') {
      startAbsenceUpdater();
    }
  }, 2000);

  window.verificarDadosCarregados = verificarDadosCarregados;
  window.carregarDadosAPI = carregarDadosAPI;
  window.getTabela3Data = getTabela3Data;
  window.resetarDadosSalvos = resetarDadosSalvos;
  window.exportarDadosAtuais = exportarDadosAtuais;
  window.resetarAusencias = resetarAusencias;
  window.openCompensacaoModal = openCompensacaoModal;
  window.closeCompensacaoModal = closeModal;
  window.resetarAusenciasCalendario = resetarAusenciasCalendario;
  window.obterDadosAtualizados = obterDadosAtualizados;
  window.salvarDadosAusencias = salvarDadosAusencias;
  window.mostrarFeedbackSalvamento = mostrarFeedbackSalvamento;
  window.atualizarModalCompensacao = atualizarModalCompensacao;
  window.gerarRelatorioAusencias = gerarRelatorioAusencias;
  window.refreshTableAbsencesFromCalendar = refreshTableAbsencesFromCalendar;

  const modal = document.getElementById('compensacaoModal');
  if (modal && modal.classList.contains('show')) {
    modal.classList.remove('show');
  }

  setTimeout(() => {
    if (typeof getEmployeesFromData === 'function') {
      try {
        const result = getEmployeesFromData();
        if (result && typeof result.then === 'function') {
          result.catch(() => {});
        }
      } catch (_) {}
    }
  }, 1000);

  syncMesOverrideSelect();

  const dragonToggleBtn = document.getElementById('dragonToggleBtn');
  if (dragonToggleBtn) {
    dragonToggleBtn.addEventListener('click', () => toggleDragonOverlay());
    setDragonOverlayState(false);
  }
});

document.addEventListener('pointermove', event => {
  if (!dragonOverlayEnabled) return;
  highlightDragonTarget(event.clientX, event.clientY);
}, { passive: true });

document.addEventListener('pointerdown', event => {
  if (!dragonOverlayEnabled) return;
  highlightDragonTarget(event.clientX, event.clientY);
  window.dispatchEvent(new CustomEvent('dragon:click', {
    detail: { x: event.clientX, y: event.clientY }
  }));
}, { passive: true });

window.addEventListener('blur', () => clearDragonTarget(true));

document.addEventListener('pointerleave', event => {
  if (event.target === document.documentElement) {
    clearDragonTarget();
  }
});

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

      window.dispatchEvent(new CustomEvent('calendarEventsReloaded', { detail: calendarEvents }));
      
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

let calendarModuleLoadPromise = null;

async function loadCalendarModule() {
  if (window.calendarModule) {
    return window.calendarModule;
  }

  if (!calendarModuleLoadPromise) {
    calendarModuleLoadPromise = loadExternalScript('/static/calendar/calendar.js')
      .then(() => {
        if (!window.calendarModule) {
          throw new Error('calendarModule não disponível após carregar script.');
        }
        return window.calendarModule;
      })
      .catch((error) => {
        calendarModuleLoadPromise = null;
        throw error;
      });
  }

  return calendarModuleLoadPromise;
}

async function ensureCalendarModuleLoaded() {
  try {
    return await loadCalendarModule();
  } catch (error) {
    console.error('Erro ao carregar módulo do calendário:', error);
    throw error;
  }
}

const calendarFunctionNames = [
  'openCalendarModal',
  'closeCalendarModal',
  'selectOption',
  'openExportModal',
  'closeExportModal',
  'exportEventsByPeriod',
  'openCalendarViewModal',
  'closeCalendarViewModal',
  'renderCalendar',
  'goToToday',
  'addEventToSelectedDate',
  'updateCalendarActionButton',
  'showEventsForSelectedDate',
  'openEventsViewModal',
  'createEventsViewModal',
  'closeEventsViewModal',
  'addEventToCurrentDate',
  'deleteEventFromView',
  'openEventModal',
  'closeEventModal',
  'populateEmployeeSelect',
  'populateEmployeeDatalist',
  'checkEmployeeConflicts',
  'showConflictWarning',
  'hideConflictWarning',
  'viewExistingEvent',
  'setupToggleButton',
  'testDataAccess',
  'getEmployeesFromData',
  'clearAbsenceIndicators',
  'addAbsenceIndicators',
  'addIndicatorStyles',
  'updateTableAbsences',
  'createAbsenceSummaryPanel',
  'updateAbsenceSummaryPanel',
  'hideAbsenceSummaryPanel',
  'testAbsenceApplication',
  'startAbsenceUpdater',
  'saveEvent',
  'getAbsenceTypeName',
  'refreshAllData'
];

const calendarMutationFunctions = new Set([
  'saveEvent',
  'addEventToSelectedDate',
  'addEventToCurrentDate',
  'deleteEventFromView'
]);

let scheduledCalendarRefresh = null;

function scheduleCalendarRefresh(delay = 200) {
  if (scheduledCalendarRefresh) {
    clearTimeout(scheduledCalendarRefresh);
  }

  scheduledCalendarRefresh = setTimeout(async () => {
    scheduledCalendarRefresh = null;
    try {
      const calendarModule = await ensureCalendarModuleLoaded();
      if (typeof calendarModule.refreshAllData === 'function') {
        await calendarModule.refreshAllData();
      } else if (typeof calendarModule.renderCalendar === 'function') {
        calendarModule.renderCalendar();
      }
    } catch (error) {
      console.error('Erro ao atualizar dados do calendário:', error);
    }
  }, delay);
}

function bindCalendarFunction(fnName) {
  return async function (...args) {
    try {
      const calendarModule = await ensureCalendarModuleLoaded();
      const targetFn = calendarModule?.[fnName];

      if (typeof targetFn !== 'function') {
        console.warn(`Função ${fnName} não encontrada no módulo do calendário.`);
        return undefined;
      }

      const result = await targetFn.apply(calendarModule, args);

      if (calendarMutationFunctions.has(fnName)) {
        scheduleCalendarRefresh();
        setTimeout(() => {
          refreshTableAbsencesFromCalendar();
          atualizarModalCompensacao();
        }, 150);
      }

      return result;
    } catch (error) {
      console.error(`Erro ao executar função ${fnName} do calendário:`, error);
      throw error;
    }
  };
}

function bindCalendarRefreshFunctions() {
  window.refreshCalendarData = () => scheduleCalendarRefresh(0);
  window.refreshCalendarUI = () => scheduleCalendarRefresh(120);
  window.refreshTodayIndicators = () => {
    scheduleCalendarRefresh(0);
    setTimeout(refreshTableAbsencesFromCalendar, 200);
    setTimeout(atualizarModalCompensacao, 220);
  };
}

function initializeTableAbsenceSync() {
  window.addEventListener('tabela3DataLoaded', (event) => {
    if (Array.isArray(event.detail)) {
      atualizarAusenciasNaTabela(event.detail);
    }
  });

  window.addEventListener('calendarEventsReloaded', (event) => {
    if (Array.isArray(event.detail)) {
      if (window.DEBUG) {
        console.log('🔄 Eventos do calendário recarregados:', event.detail.length);
      }
    }
    refreshTableAbsencesFromCalendar();
    atualizarModalCompensacao();
  });
}

calendarFunctionNames.forEach((fnName) => {
  window[fnName] = bindCalendarFunction(fnName);
});

bindCalendarRefreshFunctions();
initializeTableAbsenceSync();

window.ensureCalendarModuleLoaded = ensureCalendarModuleLoaded;
