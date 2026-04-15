// Toggle global de logs de debug (idempotente) — por padrão, desabilita console.log
(function(){
  if (typeof window === 'undefined' || typeof console === 'undefined') return;
  if (window.__logToggleInit) return; // já inicializado por outro arquivo
  window.__logToggleInit = true;

  try {
    if (!console.__origLog && typeof console.log === 'function') {
      console.__origLog = console.log.bind(console);
    }
    window.enableDebugLogs = function(){

  // Expor a função principal de renderização para o restante da aplicação
  window.renderApiTables = renderApiTables;
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

// Variável global para controle de debounce dos filtros
let debounceTimer;

// Helper: formata horas de maneira agradável
function formatHorasTexto(totalHoras, options = { style: 'compact' }) {
  const horasPorDia = 7.2;
  const negativo = Number(totalHoras) < 0;
  const valorAbs = Math.abs(Number(totalHoras || 0));
  const dias = Math.floor(valorAbs / horasPorDia);
  const horasRestantes = valorAbs % horasPorDia;
  const horas = Math.floor(horasRestantes);
  const minutos = Math.round((horasRestantes - horas) * 60);

  const style = options.style || 'compact';

  if (style === 'long') {
    let texto = "";
    if (dias > 0) texto += `${dias} dia${dias > 1 ? 's' : ''}`;
    if (horas > 0) texto += (texto ? " e " : "") + `${horas} hora${horas > 1 ? 's' : ''}`;
    if (minutos > 0) texto += (texto ? " e " : "") + `${minutos} minuto${minutos > 1 ? 's' : ''}`;
    const base = texto || "0 minuto";
    return negativo ? `- ${base}` : base;
  }

  // compact: 2d • 4h • 12m
  const partes = [];
  if (dias > 0) partes.push(`${dias}d`);
  if (horas > 0) partes.push(`${horas}h`);
  if (minutos > 0) partes.push(`${minutos}m`);
  const texto = partes.join(' • ');
  const base = texto || '0m';
  return negativo ? `- ${base}` : base;
}

function formatHorasTitulo(totalHoras) {
  const long = formatHorasTexto(totalHoras, { style: 'long' });
  const totalFmt = Number(totalHoras || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${long} (total: ${totalFmt} h)`;
}

const TABLE_ROW_STAGGER_MS = 45;
const TABLE_ROW_MAX_DELAY_MS = 360;
const TABLE_SORT_MAX_ANIMATED_ROWS = 80;

function applyRowAnimation(row, index) {
  if (!row) return;
  row.classList.add('table-row-animate');
  const delay = Math.min(index * TABLE_ROW_STAGGER_MS, TABLE_ROW_MAX_DELAY_MS);
  row.style.setProperty('--row-delay', `${delay}ms`);
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function ensureRankingColGroup(table) {
  let colGroup = table.querySelector('colgroup[data-role="ranking-auto-columns"]');

  if (!colGroup) {
    colGroup = document.createElement('colgroup');
    colGroup.dataset.role = 'ranking-auto-columns';

    for (let i = 0; i < 4; i++) {
      colGroup.appendChild(document.createElement('col'));
    }

    table.insertBefore(colGroup, table.firstChild);
  }

  return Array.from(colGroup.children);
}

function getColumnWeight(cells, options = {}) {
  const { min = 1, max = Number.POSITIVE_INFINITY, multiplier = 1 } = options;

  const maxTextLength = cells.reduce((currentMax, cell) => {
    if (!cell) return currentMax;

    const text = (cell.textContent || '')
      .replace(/\s+/g, ' ')
      .trim();

    return Math.max(currentMax, text.length);
  }, 0);

  return clamp(maxTextLength * multiplier, min, max);
}

function applyRankingColumnWidths(table, widths, headerRow, bodyRows) {
  table.style.tableLayout = 'fixed';

  const columns = ensureRankingColGroup(table);
  columns.forEach((column, index) => {
    column.style.width = widths[index];
  });

  Array.from(headerRow.children).forEach((cell, index) => {
    cell.style.width = widths[index];
  });

  bodyRows.forEach(row => {
    Array.from(row.children).forEach((cell, index) => {
      cell.style.width = widths[index];
    });
  });
}

function autoFitRankingColumns(tableId) {
  const table = document.getElementById(tableId);
  if (!table) return;

  const headerRow = Array.from(table.querySelectorAll('thead tr'))
    .find(row => row.children.length === 4);
  const bodyRows = Array.from(table.querySelectorAll('tbody tr'));

  if (!headerRow || bodyRows.length === 0) return;

  const columnCells = [0, 1, 2, 3].map(index => [
    headerRow.children[index],
    ...bodyRows.map(row => row.children[index]).filter(Boolean)
  ]);

  const weights = [
    getColumnWeight(columnCells[0], { min: 10, max: 14, multiplier: 0.95 }),
    getColumnWeight(columnCells[1], { min: 22, max: 40, multiplier: 1.25 }),
    getColumnWeight(columnCells[2], { min: 18, max: 34, multiplier: 1.1 }),
    getColumnWeight(columnCells[3], { min: 12, max: 18, multiplier: 1 })
  ];

  const totalWeight = weights.reduce((sum, value) => sum + value, 0) || 1;
  const widths = weights.map(value => `${((value / totalWeight) * 100).toFixed(2)}%`);

  applyRankingColumnWidths(table, widths, headerRow, bodyRows);
}

function renderApiTables(data) {
  if (!data) {
    console.warn('renderApiTables recebeu dados inválidos:', data);
    return;
  }

  console.log('Atualizando tabelas com dados da API:', data);
  console.log('Dados da tabela_3:', data.tabela_3);
  console.log('Tipo de data.tabela_3:', typeof data.tabela_3);
  console.log('Comprimento de data.tabela_3:', data.tabela_3 ? data.tabela_3.length : 'undefined');
  
  // ✅ SINCRONIZAR dados da tabela_3 com o script.js
  if (data.tabela_3 && window.syncTabela3Data) {
    console.log('🔄 Sincronizando dados da tabela_3 com script.js...');
    window.syncTabela3Data(data.tabela_3);
  }
  
  // Atualizar Tabela 1 - Top 10 Colaboradores com Maior Saldo
  atualizarTabela1(data.top_saldo);
  
  // Atualizar Tabela 2 - Top 10 Colaboradores com Maior Quantidade de Horas a Vencer
  atualizarTabela2(data.top_receber);
  
  // Atualizar Tabela 3 - Relatório Geral (sem delay para mostrar ausências imediatamente)
  console.log('Chamando atualizarTabela3 imediatamente...');
  atualizarTabela3(data.tabela_3);
}

// Função para atualizar a Tabela 1
function atualizarTabela1(topSaldo) {
  const tableBody = document.getElementById("tableBody");
  const tableHead = document.getElementById("tableHead");
  
  // Limpar conteúdo existente do body
  tableBody.innerHTML = '';
  
  // Limpar e recriar cabeçalho
  const headerRows = tableHead.querySelectorAll('tr:not(:first-child)');
  headerRows.forEach(row => row.remove());
  
  // Criar cabeçalho da tabela
  const headerRow = document.createElement("tr");
  const headers = ["Matrícula", "Colaborador", "Cargo", "Horas_totais"];
  
  headers.forEach(header => {
    const th = document.createElement("th");
    th.innerText = header;
    headerRow.appendChild(th);
  });
  tableHead.appendChild(headerRow);
  
  // Criar linhas da tabela
  const numRows = topSaldo.Matricula.length;
  
  for (let i = 0; i < numRows; i++) {
    const row = document.createElement("tr");
    
    // Matrícula
    const tdMatricula = document.createElement("td");
    tdMatricula.innerText = topSaldo.Matricula[i];
    row.appendChild(tdMatricula);
    
    // Colaborador
    const tdColaborador = document.createElement("td");
    tdColaborador.innerText = topSaldo.Colaborador[i];
    if (topSaldo.Colaborador[i].length > 15) {
      tdColaborador.title = topSaldo.Colaborador[i];
    }
    row.appendChild(tdColaborador);
    
    // Cargo
    const tdCargo = document.createElement("td");
    tdCargo.innerText = topSaldo.Cargo[i];
    if (topSaldo.Cargo[i].length > 15) {
      tdCargo.title = topSaldo.Cargo[i];
    }
    row.appendChild(tdCargo);
    
    // Horas Totais (formatado)
  const tdHoras = document.createElement("td");
  const totalHoras = topSaldo.SaldoAtual[i];
  tdHoras.innerText = formatHorasTexto(totalHoras, { style: 'compact' });
  tdHoras.title = formatHorasTitulo(totalHoras);
    row.appendChild(tdHoras);
    
    applyRowAnimation(row, i);
    tableBody.appendChild(row);
  }

  requestAnimationFrame(() => autoFitRankingColumns("relatorioTable"));
}

// Função para atualizar a Tabela 2
function atualizarTabela2(topReceber) {
  const tableBody2 = document.getElementById("tableBody2");
  const tableHead2 = document.getElementById("tableHead2");
  
  // Limpar conteúdo existente do body
  tableBody2.innerHTML = '';
  
  // Limpar e recriar cabeçalho
  const headerRows = tableHead2.querySelectorAll('tr:not(:first-child)');
  headerRows.forEach(row => row.remove());
  
  // Criar cabeçalho da tabela
  const headerRow2 = document.createElement("tr");
  const headers2 = ["Matrícula", "Colaborador", "Cargo", "Horas_totais_a_receber"];
  
  headers2.forEach(header => {
    const th = document.createElement("th");
    th.innerText = header;
    headerRow2.appendChild(th);
  });
  tableHead2.appendChild(headerRow2);
  
  // Criar linhas da tabela
  const numRows2 = topReceber.Matricula.length;
  
  for (let i = 0; i < numRows2; i++) {
    const row = document.createElement("tr");
    
    // Matrícula
    const tdMatricula = document.createElement("td");
    tdMatricula.innerText = topReceber.Matricula[i];
    row.appendChild(tdMatricula);
    
    // Colaborador
    const tdColaborador = document.createElement("td");
    tdColaborador.innerText = topReceber.Colaborador[i];
    if (topReceber.Colaborador[i].length > 15) {
      tdColaborador.title = topReceber.Colaborador[i];
    }
    row.appendChild(tdColaborador);
    
    // Cargo
    const tdCargo = document.createElement("td");
    tdCargo.innerText = topReceber.Cargo[i];
    if (topReceber.Cargo[i].length > 15) {
      tdCargo.title = topReceber.Cargo[i];
    }
    row.appendChild(tdCargo);
    
    // Horas Totais a Receber (formatado)
  const tdHoras = document.createElement("td");
  const totalHoras = topReceber.Horas_totais_a_receber[i];
  tdHoras.innerText = formatHorasTexto(totalHoras, { style: 'compact' });
  tdHoras.title = formatHorasTitulo(totalHoras);
    row.appendChild(tdHoras);
    
    applyRowAnimation(row, i);
    tableBody2.appendChild(row);
  }

  requestAnimationFrame(() => autoFitRankingColumns("relatorioTable2"));
}

// Função para atualizar a Tabela 3 - Relatório Geral
function atualizarTabela3(tabela3Data) {
  console.log('Iniciando atualizarTabela3 com dados:', tabela3Data);
  
  const tableHead13 = document.getElementById("tableHead13");
  const tableBody13 = document.getElementById("tableBody13");
  
  console.log('tableHead13 encontrado:', !!tableHead13);
  console.log('tableBody13 encontrado:', !!tableBody13);
  
  if (!tableHead13 || !tableBody13) {
    console.error('Elementos da tabela 3 não encontrados!');
    return;
  }
  
  // Limpar conteúdo existente
  tableHead13.innerHTML = '';
  tableBody13.innerHTML = '';
  
  if (!tabela3Data || tabela3Data.length === 0) {
    console.warn('Nenhum dado encontrado para a tabela 3');
    return;
  }
  
  console.log('Dados da tabela 3 válidos, processando...');
  
  // Definir ordem específica das colunas
  const keys13 = ["Turno", "ausencia", "Matrícula", "Colaborador", "Cargo", "Horas_a_receber", "SALARIO A RECEBER", "SALARIO ABONADO"];
  
  // Mapear nomes de colunas para exibição
  const columnDisplayNames = {
    "Turno": "Turno",
    "ausencia": "ausencia", 
    "Matrícula": "Matrícula",
    "Colaborador": "Colaborador",
    "Cargo": "Cargo",
    "Horas_a_receber": "Horas_a_receber",
    "SALARIO A RECEBER": "Receber",
    "SALARIO ABONADO": "Abono"
  };
  
  // Criar cabeçalho principal
  const headerRow13 = document.createElement("tr");
  
  keys13.forEach((key, index) => {
    const th = document.createElement("th");
    th.innerText = columnDisplayNames[key] || key; // Usar nome de exibição se existir
    th.style.padding = "8px";
    th.style.backgroundColor = "#003366";
    th.style.color = "#fff";
    th.style.border = "1px solid #ddd";
    th.style.cursor = "pointer";
    th.dataset.colIndex = index;
    th.dataset.sortOrder = "asc";
    
    const sortIcon = document.createElement("span");
    sortIcon.innerText = " ⬍";
    sortIcon.style.fontSize = "0.8em";
    th.appendChild(sortIcon);
    
    th.addEventListener("click", () => {
      th.style.transition = "transform 0.2s";
      th.style.transform = "scale(0.95)";
      setTimeout(() => {
        th.style.transform = "scale(1)";
      }, 200);
      
      th.dataset.sortOrder = th.dataset.sortOrder === "asc" ? "desc" : "asc";
      sortTable13API(index, key);
    });
    
    headerRow13.appendChild(th);
  });
  tableHead13.appendChild(headerRow13);
  
  // Criar linha de filtros
  const filterRow = document.createElement("tr");
  keys13.forEach((key, index) => {
    const th = document.createElement("th");
    th.style.border = "1px solid #ddd";
    th.style.padding = "4px";
    
    const input = document.createElement("input");
    input.type = "text";
    
    // Placeholder personalizado para a coluna ausencia
    if (key === "ausencia") {
      input.placeholder = "Filtro: Vazio, Folga, Ferias, Falta, Atestado";
      input.title = "Digite: Vazio, Folga, Ferias, Falta ou Atestado";
    } else {
      const displayName = columnDisplayNames[key] || key;
      input.placeholder = "Filtro " + displayName;
    }
    
    input.style.width = "100%";
    input.style.padding = "6px";
    input.style.border = "1px solid #ccc";
    input.style.borderRadius = "4px";
    input.style.outline = "none";
    input.style.transition = "border-color 0.3s, box-shadow 0.3s";
    
    input.addEventListener("focus", () => {
      input.style.borderColor = "#66afe9";
      input.style.boxShadow = "0 0 8px rgba(102, 175, 233, 0.6)";
    });
    input.addEventListener("blur", () => {
      input.style.borderColor = "#ccc";
      input.style.boxShadow = "none";
    });
    input.dataset.colIndex = index;
    input.addEventListener("input", function() {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        const inputs = filterRow.querySelectorAll("input");
        const filterValues = Array.from(inputs).map(input => input.value.toLowerCase());
        const rows = tableBody13.getElementsByTagName("tr");
        
        let visibleRows = 0;
        let activeFilters = 0;
        
        // Contar filtros ativos e adicionar indicadores visuais
        inputs.forEach((input, index) => {
          if (input.value.trim()) {
            activeFilters++;
            input.classList.add("filter-active");
            input.style.position = "relative";
          } else {
            input.classList.remove("filter-active");
            input.style.position = "static";
          }
        });
        
        for (let i = 0; i < rows.length; i++) {
          let showRow = true;
          const cells = rows[i].getElementsByTagName("td");
          
          for (let j = 0; j < cells.length; j++) {
            const filterValue = filterValues[j];
            if (filterValue) {
              let cellText = "";
              
              // Verificar se é a coluna de ausencia (que contém selects)
              if (keys13[j] === "ausencia") {
                const select = cells[j].querySelector("select");
                if (select) {
                  const selectedOption = select.options[select.selectedIndex];
                  cellText = selectedOption ? selectedOption.text.toLowerCase() : "";
                }
              } else {
                cellText = cells[j].innerText.toLowerCase();
              }
              
              if (cellText.indexOf(filterValue) === -1) {
                showRow = false;
                break;
              }
            }
          }
          
          if (showRow) {
            rows[i].style.display = "";
            visibleRows++;
            
            // Adicionar destaque se há filtros ativos
            if (activeFilters > 0) {
              rows[i].classList.add("table-row-highlight");
            } else {
              rows[i].classList.remove("table-row-highlight");
            }
          } else {
            rows[i].style.display = "none";
            rows[i].classList.remove("table-row-highlight");
          }
        }
        
        // Mostrar feedback visual do número de resultados
        updateFilterStatusAPI(visibleRows, rows.length, activeFilters);
      }, 300);
    });
    
    th.appendChild(input);
    filterRow.appendChild(th);
  });
  tableHead13.appendChild(filterRow);
  
  // Criar linhas de dados
  tabela3Data.forEach((registro, i) => {
    const row = document.createElement("tr");
    
    keys13.forEach((key, j) => {
      const td = document.createElement("td");
      td.dataset.columnKey = key;
      td.style.padding = "8px";
      td.style.textAlign = "center";
      td.style.border = "1px solid #ddd";
      
      if (key === 'ausencia') {
        // Criar coluna de ausencia baseada exclusivamente no calendário
        const select = document.createElement("select");
  select.className = "ausencia-select";
        select.dataset.rowIndex = String(i);
        select.dataset.matricula = String(registro['Matrícula'] || "");
        
        // Opções do select
        const opcoes = [
          { value: "", text: "Vazio" },
          { value: "Folga", text: "Folga" },
          { value: "Ferias", text: "Ferias" },
          { value: "Falta", text: "Falta" },
          { value: "Atestado", text: "Atestado" }
        ];
        
        opcoes.forEach(opcao => {
          const option = document.createElement("option");
          option.value = opcao.value;
          option.textContent = opcao.text;
          select.appendChild(option);
        });
        
        // Verificar se há ausência programada para hoje no calendário
        const today = new Date();
        const todayStr = today.toISOString().split('T')[0];
        
        // Primeiro: tentar usar dados diretos da API (mais confiável)
        let hasAbsence = false;
        let absenceValue = "";
        
        if (registro.estaAusente && registro.statusAusencia) {
          hasAbsence = true;
          const absenceMap = {
            'folga': 'Folga',
            'ferias': 'Ferias',
            'atestado': 'Atestado',
            'falta': 'Falta'
          };
          absenceValue = absenceMap[registro.statusAusencia] || registro.statusAusencia;
          console.log(`✅ Ausência da API aplicada: ${registro.Matrícula} - ${absenceValue}`);
        }
        
        // Fallback: usar eventos já carregados em memória (do servidor)
        if (!hasAbsence) {
          const events = window.calendarEvents || [];
          
          // Buscar evento para este colaborador hoje
          const todayEvent = events.find(event => {
            const eventDate = new Date(event.date);
            const eventDateStr = eventDate.toISOString().split('T')[0];
            
            if (eventDateStr !== todayStr) return false;
            
            // Verificar se é o colaborador correto
            const matricula = registro.Matrícula || '';
            const colaborador = registro.Colaborador || '';
            
            return event.employeeId === matricula.toString() || 
                   event.employeeName.toLowerCase().includes(colaborador.toLowerCase()) ||
                   colaborador.toLowerCase().includes(event.employeeName.toLowerCase());
          });
          
          // Definir valor baseado no evento do calendário
          if (todayEvent) {
            hasAbsence = true;
            const absenceMap = {
              'folga': 'Folga',
              'ferias': 'Ferias',
              'atestado': 'Atestado',
              'falta': 'Falta'
            };
            absenceValue = absenceMap[todayEvent.absenceType] || todayEvent.absenceType;
            console.log(`✅ Ausência do calendário aplicada: ${registro.Matrícula} - ${absenceValue}`);
          }
        }
        
        // Aplicar valor no select
        select.value = hasAbsence ? absenceValue : "";
        
        // Função para atualizar classes CSS
        const updateSelectClass = () => {
          const value = select.value.toLowerCase();
          select.classList.remove("folga", "falta", "ferias", "atestado");
          if (value) {
            select.classList.add(value);
          }
        };
        
        updateSelectClass();
        
        // Event listener para mudanças manuais
        select.addEventListener("change", async function() {
          const matricula = registro.Matrícula || '';
          const colaborador = registro.Colaborador || '';
          
          updateSelectClass();
          
          this.classList.add("changed");
          setTimeout(() => {
            this.classList.remove("changed");
          }, 300);
          
          console.log(`🔄 Ausência alterada manualmente: ${colaborador} - ${this.value}`);
          
          // Atualizar no servidor
          try {
            const sucesso = await updateAbsenceOnServer(matricula, colaborador, this.value);
            if (sucesso) {
              showTableChangeNotification(colaborador, this.value);
            } else {
              alert('Erro ao salvar alteração no servidor');
              // Reverter mudança em caso de erro
              this.value = "";
              updateSelectClass();
            }
          } catch (error) {
            console.error('Erro ao atualizar ausência:', error);
            alert('Erro de conexão com o servidor');
            // Reverter mudança em caso de erro
            this.value = "";
            updateSelectClass();
          }
        });
        
        td.appendChild(select);
        td.style.padding = "4px";
      } else {
        // Processar colunas normais
        let valor = registro[key];
        
        // Formatação especial para valores nulos/undefined
        if (valor === null || valor === undefined || valor === "nan") {
          valor = "";
        }
        
        // Formatações especiais baseadas no nome da coluna
        if (key.includes("SALARIO") && typeof valor === 'number') {
          // Formatação monetária
          td.innerText = valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
        } else if (key === "Turno") {
          // Formatação do turno
          let turnoFormatado = valor;
          if (valor === "1TURNO" || valor === "1") {
            turnoFormatado = "1° Turno";
          } else if (valor === "2TURNO" || valor === "2") {
            turnoFormatado = "2° Turno";
          }
          td.innerText = turnoFormatado;
        } else if (key === "Horas_a_receber") {
          // Formatação de horas com estilo compacto e tooltip detalhado
          if (typeof valor === 'number') {
            const totalHoras = valor;
            td.innerText = formatHorasTexto(totalHoras, { style: 'compact' });
            td.title = formatHorasTitulo(totalHoras);
          } else {
            td.innerText = valor;
          }
        } else {
          td.innerText = valor;
          
          // Adicionar tooltip se o texto for longo
          if (key === "Colaborador" || key === "Cargo") {
            if (valor && valor.toString().length > 20) {
              td.title = valor;
            }
          }
        }
        
        // Coloração especial para valores monetários
        if (key === "SALARIO A RECEBER" && typeof valor === 'number' && !isNaN(valor)) {
          const mag = Math.min(Math.abs(valor), 1000) / 1000; // usar magnitude
          td.style.backgroundColor = "rgba(255, 0, 0, " + mag + ")";
          if (mag > 0.7) {
            td.style.color = "#fff";
          }
        } else if (key === "SALARIO ABONADO" && typeof valor === 'number' && !isNaN(valor)) {
          const mag = Math.min(Math.abs(valor), 1000) / 1000;
          td.style.backgroundColor = "rgba(0, 255, 0, " + mag + ")";
        }
      }
      
      row.appendChild(td);
    });
    
    applyRowAnimation(row, i);
    tableBody13.appendChild(row);
  });
  
  // Tornar as funções de ordenação e filtro globais para esta tabela
  window.sortTable13API = function(colIndex, key) {
    const rowsArray = Array.from(tableBody13.getElementsByTagName("tr"));
    const totalRows = rowsArray.length;
    const prefersReducedMotion = typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const rowsToAnimate = prefersReducedMotion ? [] : rowsArray.slice(0, TABLE_SORT_MAX_ANIMATED_ROWS);
    const rowPositions = new Map();

    if (rowsToAnimate.length) {
      rowsToAnimate.forEach((row) => {
        rowPositions.set(row, row.offsetTop);
      });
    }

    const parseLocaleNumber = (str) => {
      let normalized = str.replace(/[^0-9,.-]/g, "");
      normalized = normalized.replace(/\./g, "");
      normalized = normalized.replace(/,/g, ".");
      return parseFloat(normalized);
    };

    const currentOrder = headerRow13.children[colIndex].dataset.sortOrder || "asc";

    rowsArray.sort((a, b) => {
      let cellA, cellB;

      if (key === "ausencia") {
        const selectA = a.children[colIndex].querySelector("select");
        const selectB = b.children[colIndex].querySelector("select");

        if (selectA && selectB) {
          const optionA = selectA.options[selectA.selectedIndex];
          const optionB = selectB.options[selectB.selectedIndex];
          cellA = optionA ? optionA.text.trim() : "";
          cellB = optionB ? optionB.text.trim() : "";
        } else {
          cellA = a.children[colIndex].innerText.trim();
          cellB = b.children[colIndex].innerText.trim();
        }
      } else {
        cellA = a.children[colIndex].innerText.trim();
        cellB = b.children[colIndex].innerText.trim();
      }

      const numA = parseLocaleNumber(cellA);
      const numB = parseLocaleNumber(cellB);

      if (!isNaN(numA) && !isNaN(numB)) {
        return currentOrder === "asc" ? numA - numB : numB - numA;
      }
      return currentOrder === "asc" ? cellA.localeCompare(cellB) : cellB.localeCompare(cellA);
    });

    const fragment = document.createDocumentFragment();
    rowsArray.forEach((row) => fragment.appendChild(row));
    tableBody13.appendChild(fragment);

    if (!rowsToAnimate.length || totalRows === 0) {
      return;
    }

    requestAnimationFrame(() => {
      rowsToAnimate.forEach((row) => {
        if (!rowPositions.has(row)) return;
        const oldTop = rowPositions.get(row);
        const newTop = row.offsetTop;
        const deltaY = (oldTop || 0) - newTop;

        if (!deltaY) return;

        row.style.transition = "none";
        row.style.transform = `translate3d(0, ${deltaY}px, 0)`;

        requestAnimationFrame(() => {
          const handleTransitionEnd = (event) => {
            if (event.propertyName !== "transform") return;
            row.style.transition = "";
            row.style.transform = "";
            row.removeEventListener("transitionend", handleTransitionEnd);
          };

          row.addEventListener("transitionend", handleTransitionEnd, { once: true });
          row.style.transition = "transform 0.45s cubic-bezier(0.25, 0.8, 0.25, 1)";
          row.style.transform = "translate3d(0, 0, 0)";
        });
      });
    });
  };
  
  // Função para mostrar status do filtro
  window.updateFilterStatusAPI = function(visibleRows, totalRows, activeFilters) {
    // Remover status anterior se existir
    const existingStatus = document.querySelector(".filter-status");
    if (existingStatus) {
      existingStatus.remove();
    }
    
    // Adicionar novo status se há filtros ativos
    if (activeFilters > 0) {
      const statusDiv = document.createElement("div");
      statusDiv.className = "filter-status";
      statusDiv.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: linear-gradient(135deg, #28a745, #20c997);
        color: white;
        padding: 10px 15px;
        border-radius: 20px;
        font-size: 14px;
        font-weight: bold;
        box-shadow: 0 4px 12px rgba(40, 167, 69, 0.3);
        z-index: 1000;
        animation: slideInRight 0.3s ease;
      `;
      statusDiv.innerHTML = `
        🔍 Filtros ativos: ${activeFilters}<br>
        📊 Mostrando: ${visibleRows} de ${totalRows} registros
      `;
      
      document.body.appendChild(statusDiv);
      
      // Remover automaticamente após 3 segundos
      setTimeout(() => {
        if (statusDiv.parentNode) {
          statusDiv.style.animation = "slideOutRight 0.3s ease";
          setTimeout(() => {
            statusDiv.remove();
          }, 300);
        }
      }, 3000);
    }
  };
}

// (Removido) DOMContentLoaded duplicado — a carga inicial foi consolidada em static/script.js

// Funções auxiliares removidas - agora o servidor gerencia todos os eventos
// As alterações na tabela são enviadas diretamente para o servidor via updateAbsenceOnServer()

function showTableChangeNotification(colaborador, tipoAusencia) {
  // Remover notificação anterior se existir
  const existingNotification = document.querySelector('.table-change-notification');
  if (existingNotification) {
    existingNotification.remove();
  }
  
  const notification = document.createElement('div');
  notification.className = 'table-change-notification';
  notification.style.cssText = `
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    background: linear-gradient(135deg, #007bff, #0056b3);
    color: white;
    padding: 20px 30px;
    border-radius: 15px;
    font-size: 16px;
    font-weight: bold;
    box-shadow: 0 8px 25px rgba(0, 123, 255, 0.3);
    z-index: 10000;
    animation: scaleIn 0.3s ease;
    text-align: center;
    max-width: 400px;
  `;
  
  if (tipoAusencia && tipoAusencia !== "") {
    notification.innerHTML = `
      ✅ <strong>Ausência Registrada</strong><br>
      <span style="font-size: 14px;">${colaborador}</span><br>
      <span style="font-size: 18px; color: #ffd700;">${tipoAusencia}</span><br>
      <small style="opacity: 0.8;">Salvo no servidor</small>
    `;
  } else {
    notification.innerHTML = `
      🔄 <strong>Ausência Removida</strong><br>
      <span style="font-size: 14px;">${colaborador}</span><br>
      <small style="opacity: 0.8;">Atualizado no servidor</small>
    `;
  }
  
  document.body.appendChild(notification);
  
  // Remover após 2 segundos
  setTimeout(() => {
    notification.style.animation = 'scaleOut 0.3s ease';
    setTimeout(() => {
      if (notification.parentNode) {
        notification.remove();
      }
    }, 300);
  }, 2000);
}

// Adicionar estilos CSS para as animações e classes
if (!document.querySelector('#api-loader-styles')) {
  const style = document.createElement('style');
  style.id = 'api-loader-styles';
style.textContent = `
    @keyframes slideInRight {
        from {
            transform: translateX(100%);
            opacity: 0;
        }
        to {
            transform: translateX(0);
            opacity: 1;
        }
    }

    @keyframes slideOutRight {
        from {
            transform: translateX(0);
            opacity: 1;
        }
        to {
            transform: translateX(100%);
            opacity: 0;
        }
    }

    @keyframes scaleIn {
        from {
            transform: translate(-50%, -50%) scale(0.5);
            opacity: 0;
        }
        to {
            transform: translate(-50%, -50%) scale(1);
            opacity: 1;
        }
    }

    @keyframes scaleOut {
        from {
            transform: translate(-50%, -50%) scale(1);
            opacity: 1;
        }
        to {
            transform: translate(-50%, -50%) scale(0.5);
            opacity: 0;
        }
    }

    .filter-active {
        background: linear-gradient(135deg, #e3f2fd, #bbdefb) !important;
        border-color: #2196f3 !important;
        font-weight: bold;
    }

    .table-row-highlight {
        background: linear-gradient(135deg, #f8f9fa, #e9ecef) !important;
    }

    .ausencia-select {
        width: 100%;
        padding: 4px;
        border: 1px solid #ddd;
        border-radius: 4px;
        background: white;
        transition: all 0.3s ease;
    }

    /* Apenas bordas coloridas */
    .ausencia-select.folga {
        background: white !important;
        border: 2px solid #28a745 !important;
        color: #28a745;
        font-weight: bold;
    }

    .ausencia-select.ferias {
        background: white !important;
        border: 2px solid #ffc107 !important;
        color: #ffc107;
        font-weight: bold;
    }

    .ausencia-select.falta {
        background: white !important;
        border: 2px solid #dc3545 !important;
        color: #dc3545;
        font-weight: bold;
    }

    .ausencia-select.atestado {
        background: white !important;
        border: 2px solid #17a2b8 !important;
        color: #17a2b8;
        font-weight: bold;
    }

    .ausencia-select.changed {
        transform: scale(1.1);
        box-shadow: 0 0 15px rgba(0, 123, 255, 0.5);
    }
`;
  document.head.appendChild(style);
}
