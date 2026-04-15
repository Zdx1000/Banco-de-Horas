(function() {
  if (window.__calendarModuleLoaded) {
    return;
  }
  window.__calendarModuleLoaded = true;

  function isDateOnlyString(value) {
    return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value.trim());
  }

  function parseLocalDate(value) {
    if (value instanceof Date) {
      return new Date(
        value.getFullYear(),
        value.getMonth(),
        value.getDate(),
        value.getHours(),
        value.getMinutes(),
        value.getSeconds(),
        value.getMilliseconds()
      );
    }

    if (isDateOnlyString(value)) {
      const [year, month, day] = value.split('-').map(Number);
      return new Date(year, month - 1, day, 12, 0, 0, 0);
    }

    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  function getLocalDateKey(value) {
    const date = parseLocalDate(value);
    if (!date) return '';

    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  function getStartOfLocalDay(value) {
    const date = parseLocalDate(value);
    if (!date) return null;
    return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0);
  }

  function getLocalDayDiff(targetDate, baseDate = new Date()) {
    const target = getStartOfLocalDay(targetDate);
    const base = getStartOfLocalDay(baseDate);
    if (!target || !base) return 0;
    return Math.round((target - base) / (1000 * 60 * 60 * 24));
  }

  function openCalendarModal() {
    const modal = document.getElementById('calendarOptionsModal');
    syncMesOverrideSelect();
    modal.style.display = '';
    modal.classList.add('show');
  }

  function closeCalendarModal() {
    const modal = document.getElementById('calendarOptionsModal');
    modal.classList.remove('show');
    setTimeout(() => {
      if (!modal.classList.contains('show')) {
        modal.style.display = 'none';
      }
    }, 100);
  }

  function selectOption(option) {
    closeCalendarModal();

    if (option === 'database') {
      return;
    }

    if (option === 'calendar') {
      openCalendarViewModal();
    } else if (option === 'export') {
      openExportModal();
    }
  }

  function openExportModal() {
    const modal = document.getElementById('exportModal');
    if (!modal) return;
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
    setTimeout(() => {
      if (!modal.classList.contains('show')) {
        modal.style.display = 'none';
      }
    }, 120);
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

      if (!Array.isArray(calendarEvents) || calendarEvents.length === 0) {
        await loadEventsFromServer();
      }

      const filtered = (calendarEvents || []).filter((ev) => ev.date >= start && ev.date <= end);

      if (filtered.length === 0) {
        alert('Nenhum evento encontrado no período selecionado.');
        return;
      }

      const rows = filtered.map((ev) => ({
        Data: ev.date,
        Matricula: ev.employeeId,
        Colaborador: ev.employeeName,
        Tipo: getAbsenceTypeName(ev.absenceType),
        Observacoes: ev.notes || '',
        CriadoEm: ev.createdAt ? new Date(ev.createdAt).toLocaleString('pt-BR') : ''
      }));

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

  function openCalendarViewModal() {
    const modal = document.getElementById('calendarModal');
    modal.style.display = '';
    modal.classList.add('show');

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
    setTimeout(() => {
      if (!modal.classList.contains('show')) {
        modal.style.display = 'none';
      }
    }, 100);
  }

  function renderCalendar() {
    const monthNames = [
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
      'Dezembro'
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

    calendarDays.innerHTML = '';

    const firstDay = new Date(currentCalendarDate.getFullYear(), currentCalendarDate.getMonth(), 1);
    const startDate = new Date(firstDay);
    startDate.setDate(startDate.getDate() - firstDay.getDay());

    let diasComEventos = 0;

    for (let i = 0; i < 42; i++) {
      const date = new Date(startDate);
      date.setDate(startDate.getDate() + i);

      const dayElement = document.createElement('div');
      dayElement.className = 'calendar-day';

      const dayContent = document.createElement('div');
      dayContent.className = 'day-content';
      dayContent.textContent = date.getDate();

      const dayNameElement = document.createElement('div');
      dayNameElement.className = 'day-name';
      dayNameElement.textContent = dayNames[date.getDay()];
      dayElement.appendChild(dayNameElement);

      if (date.getMonth() !== currentCalendarDate.getMonth()) {
        dayElement.classList.add('other-month');
      }

      if (date.getDay() === 0) {
        dayElement.classList.add('sunday');
      }

      const today = new Date();
      const todayDateString = today.toISOString().split('T')[0];
      const dayDateString = date.toISOString().split('T')[0];

      if (dayDateString === todayDateString) {
        dayElement.classList.add('today');
      }

      if (selectedDate && date.toDateString() === selectedDate.toDateString()) {
        dayElement.classList.add('selected');
      }

      const hasEvent = calendarEvents && calendarEvents.some((event) => event.date === dayDateString);

      if (hasEvent) {
        dayElement.classList.add('has-event');

        const isPastEvent = dayDateString < todayDateString;
        if (isPastEvent) {
          dayElement.classList.add('past-event');
        }

        diasComEventos++;

        const eventosNoDia = calendarEvents.filter((event) => event.date === dayDateString);
        const eventosTexto = eventosNoDia
          .map((event) => `${event.employeeName}: ${getAbsenceTypeName(event.absenceType)}`)
          .join('\n');

        dayElement.title = eventosTexto;

        if (window.DEBUG && date.getMonth() === currentCalendarDate.getMonth()) {
          console.log(`📅 Dia ${date.getDate()}: ${eventosNoDia.length} evento(s)${isPastEvent ? ' (PASSADO)' : ''}`);
        }
      }

      dayElement.addEventListener('click', () => {
        document.querySelectorAll('.calendar-day.selected').forEach((el) => {
          el.classList.remove('selected');
        });

        dayElement.classList.add('selected');
        selectedDate = new Date(date);
        updateCalendarActionButton();
      });

      dayElement.appendChild(dayContent);
      calendarDays.appendChild(dayElement);
    }

    if (window.DEBUG) console.log(`✅ Calendário renderizado com ${diasComEventos} dias contendo eventos`);

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

  function updateCalendarActionButton() {
    const actionButton = document.querySelector('#calendarModal .modal-footer .control-button.export-btn');
    if (!actionButton || !selectedDate) return;

    const selectedDateString = selectedDate.toISOString().split('T')[0];
    const eventsOnSelectedDate = calendarEvents.filter((event) => event.date === selectedDateString);

    if (eventsOnSelectedDate.length > 0) {
      actionButton.onclick = () => showEventsForSelectedDate();
      actionButton.innerHTML = '👁️ Ver Eventos';
      actionButton.title = `${eventsOnSelectedDate.length} evento(s) nesta data`;
    } else {
      actionButton.onclick = () => addEventToSelectedDate();
      actionButton.innerHTML = '➕ Adicionar Evento';
      actionButton.title = 'Adicionar novo evento para esta data';
    }
  }

  function showEventsForSelectedDate() {
    if (!selectedDate) return;

    const selectedDateString = selectedDate.toISOString().split('T')[0];
    const eventsOnSelectedDate = calendarEvents.filter((event) => event.date === selectedDateString);
    openEventsViewModal(eventsOnSelectedDate, selectedDate);
  }

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

    const titleEl = document.getElementById('eventsViewTitle');
    const dateLabelEl = document.getElementById('eventsViewDateLabel');
    const metaEl = document.getElementById('eventsViewMeta');
    const statsContainer = document.getElementById('eventsViewStats');
    const eventsCollection = document.getElementById('eventsViewCollection');
    const emptyStateEl = document.getElementById('eventsViewEmpty');

    if (titleEl) {
      titleEl.textContent = '📅 Eventos do Dia';
    }

    const formattedDateCapitalized = dateFormatted.charAt(0).toUpperCase() + dateFormatted.slice(1);
    if (dateLabelEl) {
      dateLabelEl.textContent = formattedDateCapitalized;
    }

    const totalEvents = events.length;
    if (metaEl) {
      metaEl.textContent = totalEvents === 1 ? '1 evento cadastrado para esta data' : `${totalEvents} eventos cadastrados para esta data`;
    }

    const absenceTypeMap = {
      folga: { name: 'Folga', plural: 'Folgas', icon: '🌿', color: '#10b981' },
      ferias: { name: 'Férias', plural: 'Férias', icon: '🏖️', color: '#f59e0b' },
      atestado: { name: 'Atestado', plural: 'Atestados', icon: '🏥', color: '#6366f1' },
      falta: { name: 'Falta', plural: 'Faltas', icon: '⛔', color: '#ef4444' },
      default: { name: 'Evento', plural: 'Eventos', icon: '🗂️', color: '#64748b' }
    };

    const typeCounts = events.reduce((acc, event) => {
      const typeKey = event.absenceType && absenceTypeMap[event.absenceType] ? event.absenceType : 'default';
      acc[typeKey] = (acc[typeKey] || 0) + 1;
      return acc;
    }, {});

    if (statsContainer) {
      statsContainer.innerHTML = '';
      Object.entries(typeCounts).forEach(([typeKey, count]) => {
        const info = absenceTypeMap[typeKey] || absenceTypeMap.default;
        const chip = document.createElement('span');
        chip.className = `events-view-chip events-view-chip--${typeKey}`;
        chip.textContent = `${info.icon} ${count} ${count === 1 ? info.name : info.plural}`;
        statsContainer.appendChild(chip);
      });
    }

    if (!eventsCollection) {
      return;
    }

    eventsCollection.innerHTML = '';

    const eventsSorted = [...events].sort((a, b) => {
      const nameA = (a.employeeName || '').toLocaleLowerCase('pt-BR');
      const nameB = (b.employeeName || '').toLocaleLowerCase('pt-BR');
      return nameA.localeCompare(nameB);
    });

    const formatDateTime = (value) => {
      if (!value) return '—';
      const dateValue = new Date(value);
      if (Number.isNaN(dateValue.getTime())) return '—';
      return dateValue.toLocaleString('pt-BR', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    };

    const createMetaItem = (label, value) => {
      const wrapper = document.createElement('div');
      wrapper.className = 'event-view-card__meta-item';
      const labelEl = document.createElement('span');
      labelEl.className = 'event-view-card__meta-label';
      labelEl.textContent = label;
      const valueEl = document.createElement('span');
      valueEl.className = 'event-view-card__meta-value';
      valueEl.textContent = value || '—';
      wrapper.appendChild(labelEl);
      wrapper.appendChild(valueEl);
      return wrapper;
    };

    eventsSorted.forEach((event) => {
      const typeKey = event.absenceType && absenceTypeMap[event.absenceType] ? event.absenceType : 'default';
      const typeInfo = absenceTypeMap[typeKey];

      const card = document.createElement('article');
      card.className = `event-view-card event-view-card--${typeKey}`;
      card.style.setProperty('--accent-color', typeInfo.color);

      const header = document.createElement('header');
      header.className = 'event-view-card__header';

      const icon = document.createElement('span');
      icon.className = 'event-view-card__icon';
      icon.textContent = typeInfo.icon;

      const titleGroup = document.createElement('div');
      titleGroup.className = 'event-view-card__title';

      const title = document.createElement('h3');
      title.textContent = typeInfo.name;

      const subtitle = document.createElement('p');
      subtitle.textContent = event.employeeName || 'Colaborador não informado';

      titleGroup.appendChild(title);
      titleGroup.appendChild(subtitle);

      const actions = document.createElement('div');
      actions.className = 'event-view-card__actions';

      const deleteButton = document.createElement('button');
      deleteButton.type = 'button';
      deleteButton.className = 'event-view-card__action event-view-card__action--danger';
      deleteButton.setAttribute('aria-label', `Excluir evento de ${event.employeeName || 'colaborador'}`);
      deleteButton.textContent = '🗑️';
      deleteButton.onclick = () => deleteEventFromView(event.id);

      actions.appendChild(deleteButton);

      header.appendChild(icon);
      header.appendChild(titleGroup);
      header.appendChild(actions);

      const metaWrapper = document.createElement('div');
      metaWrapper.className = 'event-view-card__meta';
      metaWrapper.appendChild(createMetaItem('Matrícula', event.employeeId || '—'));
      metaWrapper.appendChild(createMetaItem('Criado em', formatDateTime(event.createdAt)));

      const notesWrapper = document.createElement('div');
      notesWrapper.className = 'event-view-card__notes';
      if (event.notes) {
        const notesLabel = document.createElement('span');
        notesLabel.className = 'event-view-card__notes-label';
        notesLabel.textContent = 'Observações';
        const notesText = document.createElement('p');
        notesText.className = 'event-view-card__notes-text';
        notesText.textContent = event.notes;
        notesWrapper.appendChild(notesLabel);
        notesWrapper.appendChild(notesText);
      } else {
        notesWrapper.classList.add('event-view-card__notes--empty');
        const emptyText = document.createElement('p');
        emptyText.textContent = 'Nenhuma observação adicionada.';
        notesWrapper.appendChild(emptyText);
      }

      card.appendChild(header);
      card.appendChild(metaWrapper);
      card.appendChild(notesWrapper);

      eventsCollection.appendChild(card);
    });

    if (emptyStateEl) {
      emptyStateEl.style.display = eventsCollection.children.length === 0 ? 'flex' : 'none';
    }

    modal.style.display = 'block';
    setTimeout(() => modal.classList.add('show'), 10);
  }

  function createEventsViewModal() {
    const modalHTML = `
      <div id="eventsViewModal" class="modal">
        <div class="modal-content event-view">
          <div class="modal-header">
            <button type="button" class="close" onclick="closeEventsViewModal()" aria-label="Fechar visualização de eventos">&times;</button>
            <h2 id="eventsViewTitle">📅 Eventos do Dia</h2>
          </div>
          <div class="modal-body">
            <section class="events-view-summary">
              <div class="events-view-summary__icon">📆</div>
              <div class="events-view-summary__content">
                <h3 id="eventsViewDateLabel">Data selecionada</h3>
                <p id="eventsViewMeta">0 eventos cadastrados para esta data</p>
              </div>
              <div class="events-view-summary__stats" id="eventsViewStats"></div>
            </section>
            <div id="eventsViewEmpty" class="events-view-empty">
              <span class="events-view-empty__icon">✨</span>
              <p class="events-view-empty__text">Nenhum evento registrado neste dia.</p>
              <button type="button" class="events-view-empty__action" onclick="addEventToCurrentDate()">Adicionar evento</button>
            </div>
            <section id="eventsViewCollection" class="events-view-collection"></section>
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

  function closeEventsViewModal() {
    const modal = document.getElementById('eventsViewModal');
    if (modal) {
      modal.classList.remove('show');
      setTimeout(() => {
        modal.style.display = 'none';
      }, 300);
    }
  }

  function addEventToCurrentDate() {
    closeEventsViewModal();
    if (selectedDate) {
      openEventModal(selectedDate);
    }
  }

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
        await loadEventsFromServer();

        closeEventsViewModal();
        renderCalendar();

        if (selectedDate) {
          const selectedDateString = selectedDate.toISOString().split('T')[0];
          const updatedEvents = calendarEvents.filter((event) => event.date === selectedDateString);
          openEventsViewModal(updatedEvents, selectedDate);
        }

        updateCalendarActionButton();
        showTableChangeNotification('Evento excluído', 'com sucesso');

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

  function changeCalendarMonth(offset) {
    if (!Number.isInteger(offset) || offset === 0) return;

    const currentDay = currentCalendarDate.getDate();
    const updatedDate = new Date(currentCalendarDate);
    updatedDate.setDate(1);
    updatedDate.setMonth(updatedDate.getMonth() + offset);

    const daysInMonth = new Date(updatedDate.getFullYear(), updatedDate.getMonth() + 1, 0).getDate();
    updatedDate.setDate(Math.min(currentDay, daysInMonth));

    currentCalendarDate = updatedDate;
    renderCalendar();
  }

  function setupCalendarNavigation() {
    const prevMonthBtn = document.getElementById('prevMonth');
    const nextMonthBtn = document.getElementById('nextMonth');

    if (prevMonthBtn && !prevMonthBtn.dataset.bound) {
      prevMonthBtn.addEventListener('click', () => changeCalendarMonth(-1));
      prevMonthBtn.dataset.bound = 'true';
    }

    if (nextMonthBtn && !nextMonthBtn.dataset.bound) {
      nextMonthBtn.addEventListener('click', () => changeCalendarMonth(1));
      nextMonthBtn.dataset.bound = 'true';
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', setupCalendarNavigation, { once: true });
  } else {
    setupCalendarNavigation();
  }

  function openEventModal(date) {
    const modal = document.getElementById('eventModal');
    const eventDateInput = document.getElementById('eventDate');
    const employeeInput = document.getElementById('employeeInput');
    const absenceTypeSelect = document.getElementById('absenceType');
    const feriassDurationGroup = document.getElementById('feriassDurationGroup');
    const atestadoDurationGroup = document.getElementById('atestadoDurationGroup');
    const folgaDurationGroup = document.getElementById('folgaDurationGroup');

    const formattedDate = date.toLocaleDateString('pt-BR', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });

    eventDateInput.value = formattedDate;
    selectedDate = date;
    populateEmployeeDatalist();
    setupToggleButton();

    absenceTypeSelect.addEventListener('change', function() {
      feriassDurationGroup.style.display = 'none';
      atestadoDurationGroup.style.display = 'none';
      folgaDurationGroup.style.display = 'none';

      if (this.value === 'ferias') {
        feriassDurationGroup.style.display = 'block';
      } else if (this.value === 'atestado') {
        atestadoDurationGroup.style.display = 'block';
      } else if (this.value === 'folga') {
        folgaDurationGroup.style.display = 'block';
      }
    });

    setTimeout(() => {
      checkEmployeeConflicts();
    }, 100);

    modal.style.display = '';
    modal.classList.add('show');
  }

  function closeEventModal() {
    const modal = document.getElementById('eventModal');
    modal.classList.remove('show');
    setTimeout(() => {
      if (!modal.classList.contains('show')) {
        modal.style.display = 'none';
      }
    }, 100);

    hideConflictWarning();

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
    employeeSelect.innerHTML = '<option value="">Selecione um colaborador...</option>';

    const employees = getEmployeesFromData();

    employees.forEach((employee) => {
      const option = document.createElement('option');
      option.value = employee.matricula;

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
    employeeList.innerHTML = '';

    const employees = getEmployeesFromData();

    employees.forEach((employee) => {
      const option = document.createElement('option');
      option.value = employee.matricula;

      if (employee.estaAusente) {
        option.textContent = `${employee.matricula} - ${employee.nome} [AUSENTE: ${employee.statusAusencia.toUpperCase()}]`;
      } else {
        option.textContent = `${employee.matricula} - ${employee.nome}`;
      }

      employeeList.appendChild(option);
    });

    populateEmployeeSelect();

    const employeeInput = document.getElementById('employeeInput');
    employeeInput.addEventListener('input', function() {
      const searchValue = this.value.toLowerCase();
      const filtered = employees.filter(
        (emp) => emp.matricula.toLowerCase().includes(searchValue) || emp.nome.toLowerCase().includes(searchValue)
      );

      employeeList.innerHTML = '';
      filtered.forEach((employee) => {
        const option = document.createElement('option');
        option.value = employee.matricula;

        if (employee.estaAusente) {
          option.textContent = `${employee.matricula} - ${employee.nome} [AUSENTE: ${employee.statusAusencia.toUpperCase()}]`;
        } else {
          option.textContent = `${employee.matricula} - ${employee.nome}`;
        }

        employeeList.appendChild(option);
      });

      checkEmployeeConflicts();
    });

    const employeeSelect = document.getElementById('employeeSelect');
    employeeSelect.addEventListener('change', checkEmployeeConflicts);
  }

  function checkEmployeeConflicts() {
    if (!selectedDate || !calendarEvents) return;

    const employeeInput = document.getElementById('employeeInput');
    const employeeSelect = document.getElementById('employeeSelect');
    let employeeId = '';

    if (employeeInput.style.display !== 'none') {
      employeeId = employeeInput.value.trim();
    } else {
      employeeId = employeeSelect.value;
    }

    if (!employeeId) {
      hideConflictWarning();
      return;
    }

    const dateStr = selectedDate.toISOString().split('T')[0];
    const existingEvent = calendarEvents.find(
      (event) => event.date === dateStr && (event.employeeId === employeeId || event.employeeId === employeeId.toString())
    );

    if (existingEvent) {
      showConflictWarning(existingEvent);
    } else {
      hideConflictWarning();
    }
  }

  function showConflictWarning(existingEvent) {
    hideConflictWarning();

    const modal = document.getElementById('eventModal');
    const modalBody = modal.querySelector('.modal-body');

    const warningDiv = document.createElement('div');
    warningDiv.id = 'conflictWarning';
    warningDiv.style.cssText =
      'background: linear-gradient(135deg, #fff3cd, #ffeaa7);\
    ' +
      'border: 2px solid #ffc107;\
    ' +
      'border-radius: 8px;\
    ' +
      'padding: 12px;\
    ' +
      'margin: 10px 0;\
    ' +
      'display: flex;\
    ' +
      'align-items: center;\
    ' +
      'gap: 10px;\
    ' +
      'animation: slideDown 0.3s ease;';

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

  function hideConflictWarning() {
    const warningDiv = document.getElementById('conflictWarning');
    if (warningDiv) {
      warningDiv.remove();
    }
  }

  function viewExistingEvent(eventId) {
    const existingEvent = calendarEvents.find((e) => e.id === eventId);
    if (existingEvent) {
      const eventDate = new Date(existingEvent.date);
      selectedDate = eventDate;
      openEventsViewModal([existingEvent], eventDate);
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
        employeeInput.style.display = 'block';
        employeeSelect.style.display = 'none';
        container.style.display = 'flex';
        toggleBtn.textContent = '📋';
        toggleBtn.title = 'Alternar para lista';
        isSelectMode = false;
      } else {
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
    testDataAccess();

    const employees = [];

    try {
      const dadosTabela3 = getTabela3Data();

      console.log('🔍 Estrutura dos dados recebidos:', {
        tipo: typeof dadosTabela3,
        isArray: Array.isArray(dadosTabela3),
        temDados:
          dadosTabela3 &&
          (Array.isArray(dadosTabela3)
            ? dadosTabela3.length > 0
            : Object.keys(dadosTabela3).length > 0)
      });

      if (dadosTabela3) {
        let registros = [];

        if (Array.isArray(dadosTabela3)) {
          registros = dadosTabela3;
        } else if (typeof dadosTabela3 === 'object') {
          if (dadosTabela3.dados) {
            registros = dadosTabela3.dados;
          } else if (dadosTabela3.registros) {
            registros = dadosTabela3.registros;
          } else {
            registros = Object.values(dadosTabela3);
          }
        }

        console.log(`📊 Processando ${registros.length} registros`);

        if (registros.length > 0) {
          console.log('✅ Usando dados da API tabela_3 para colaboradores');
          console.log('📋 Exemplo de registro:', registros[0]);

          const uniqueEmployees = {};

          registros.forEach((registro, index) => {
            const matricula = registro.Matrícula || registro.matricula || registro.id;
            const colaborador = registro.Colaborador || registro.colaborador || registro.nome || registro.name;
            const statusAusencia = registro.statusAusencia || '';
            const estaAusente = registro.estaAusente || false;

            if (index < 3) {
              console.log(`Registro ${index}:`, {
                matricula,
                colaborador,
                statusAusencia,
                estaAusente,
                registro
              });
            }

            if (
              matricula &&
              colaborador &&
              matricula !== 'nan' &&
              matricula !== '' &&
              matricula !== null &&
              colaborador !== 'nan' &&
              colaborador !== '' &&
              colaborador !== null
            ) {
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

          Object.values(uniqueEmployees).forEach((emp) => {
            employees.push(emp);
          });

          console.log(`✅ Total de funcionários únicos encontrados: ${employees.length}`);

          const ausentes = employees.filter((emp) => emp.estaAusente);
          if (ausentes.length > 0) {
            console.log(
              `👥 Funcionários ausentes hoje (${ausentes.length}):`,
              ausentes.map((emp) => `${emp.matricula} - ${emp.nome} (${emp.statusAusencia})`)
            );
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

  function clearAbsenceIndicators() {
    const indicators = document.querySelectorAll('.absence-indicator[data-origin="table"]');
    indicators.forEach((indicator) => indicator.remove());
  }

  function addAbsenceIndicators(totalAusentes) {
    const headerIndicator = document.querySelector('.absence-indicator[data-role="header-indicator"]');
    const today = new Date();
    const todayStr = getLocalDateKey(today);

    if (headerIndicator) {
      const valueNode = headerIndicator.querySelector('.indicator-value');
      let totalHoje = typeof totalAusentes === 'number' ? totalAusentes : null;

      if (totalHoje === null) {
        if (Array.isArray(window.calendarEvents) && window.calendarEvents.length) {
          totalHoje = window.calendarEvents.filter((event) => {
            return getLocalDateKey(event.date) === todayStr;
          }).length;
        } else {
          const selects = document.querySelectorAll('#tableBody13 .ausencia-select');
          totalHoje = Array.from(selects).filter((select) => select.value && select.value.trim() !== '').length;
        }
      }

      if (valueNode) {
        valueNode.textContent = totalHoje !== null ? String(totalHoje) : '--';
      }
    }

    if (!Array.isArray(window.calendarEvents) || window.calendarEvents.length === 0) {
      clearAbsenceIndicators();
      return;
    }

    clearAbsenceIndicators();

    const eventsByEmployee = window.calendarEvents.reduce((acc, event) => {
      if (!event || !event.employeeId) return acc;
      const eventDate = parseLocalDate(event.date);
      const eventDateStr = getLocalDateKey(event.date);

      if (!eventDate || !eventDateStr) return acc;

      if (eventDateStr < todayStr) return acc;

      const employeeId = String(event.employeeId);
      if (!acc[employeeId]) acc[employeeId] = [];
      acc[employeeId].push({
        date: eventDate,
        raw: event
      });
      return acc;
    }, {});

    const rows = document.querySelectorAll('#tableBody13 tr');

    rows.forEach((row) => {
      const cells = row.cells;
      if (!cells || cells.length === 0) return;

      const matriculaCell = cells[0];
      const matricula = (matriculaCell.textContent || '').trim();
      if (!matricula || !eventsByEmployee[matricula]) return;

      const futureEvents = eventsByEmployee[matricula]
        .slice()
        .sort((a, b) => a.date - b.date);

      const nextEvent = futureEvents[0];
      if (!nextEvent) return;

      const indicator = document.createElement('span');
      indicator.className = 'absence-indicator';
      indicator.dataset.origin = 'table';
      indicator.style.cssText =
        'position: absolute; top: 2px; right: 2px; width: 12px; height: 12px; border-radius: 50%; background: linear-gradient(45deg, #FF6B6B, #FF8E8E); box-shadow: 0 2px 4px rgba(0,0,0,0.2); z-index: 10; display: inline-block; pointer-events: none;';

      const daysDiff = Math.max(0, Math.ceil((nextEvent.date - today) / (1000 * 60 * 60 * 24)));
      const dayLabel = daysDiff === 0 ? 'hoje' : `${daysDiff} dia${daysDiff > 1 ? 's' : ''}`;
      indicator.title = `Ausência programada: ${getAbsenceTypeName(nextEvent.raw.absenceType)} em ${nextEvent.date.toLocaleDateString('pt-BR')} (${dayLabel})`;

      if (matriculaCell.style.position === '' || getComputedStyle(matriculaCell).position === 'static') {
        matriculaCell.style.position = 'relative';
      }

      matriculaCell.appendChild(indicator);
    });
  }

  function addIndicatorStyles() {
    if (document.getElementById('absence-indicator-style')) return;

    const style = document.createElement('style');
    style.id = 'absence-indicator-style';
    style.textContent = `
      .absence-indicator[data-origin="table"] {
        transition: none;
      }

      .absence-indicator[data-origin="table"]:hover {
        transform: none !important;
        cursor: help;
      }
    `;
    document.head.appendChild(style);
  }

  function updateTableAbsences() {
    console.log('🔄 Atualizando ausencias da tabela baseado exclusivamente no calendário...');
    refreshTableAbsencesFromCalendar();
    addAbsenceIndicators();
  }

  function createAbsenceSummaryPanel() {
    let panel = document.getElementById('absenceSummaryPanel');
    if (!panel) {
      panel = document.createElement('section');
      panel.id = 'absenceSummaryPanel';
      panel.className = 'absence-summary-panel';
      panel.setAttribute('role', 'status');
      panel.setAttribute('aria-live', 'polite');
      panel.setAttribute('aria-atomic', 'true');
      document.body.appendChild(panel);
    }

    return panel;
  }

  function updateAbsenceSummaryPanel() {
    const today = new Date();
    const todayStr = getLocalDateKey(today);

    const events = calendarEvents || [];

    const escapeHtml = (value) => {
      if (value === null || value === undefined) {
        return '';
      }
      return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
    };

    const todayEvents = events.filter((event) => {
      return getLocalDateKey(event.date) === todayStr;
    });

    const absenceCount = {};
    todayEvents.forEach((event) => {
      const type = event.absenceType;
      absenceCount[type] = (absenceCount[type] || 0) + 1;
    });

    if (todayEvents.length > 0) {
      const panel = createAbsenceSummaryPanel();

      const weekday = today.toLocaleDateString('pt-BR', { weekday: 'long' });
      const formattedWeekday = weekday ? escapeHtml(weekday.charAt(0).toUpperCase() + weekday.slice(1)) : '';
      const formattedDate = escapeHtml(
        today.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })
      );

      const typeBadges = Object.entries(absenceCount)
        .sort(([, a], [, b]) => b - a)
        .map(([type, count]) => {
          const rawTypeName = typeof getAbsenceTypeName === 'function' ? getAbsenceTypeName(type) : type || 'Ausência';
          const typeName = escapeHtml(rawTypeName);
          const normalizedType = (type || 'outros').toLowerCase();
          return `
            <span class="absence-summary-badge" data-type="${normalizedType}">
              <span class="absence-summary-badge-label">${typeName}</span>
              <span class="absence-summary-badge-count">${count}</span>
            </span>
          `;
        })
        .join('');

      const highlightEvents = todayEvents
        .slice()
        .sort((a, b) => {
          const nameA = (a.employeeName || a.employee || a.collaboratorName || '').localeCompare(
            b.employeeName || b.employee || b.collaboratorName || '',
            'pt-BR',
            { sensitivity: 'base' }
          );
          return nameA;
        })
        .slice(0, 4);

      const listItems = highlightEvents
        .map((event, index) => {
          const employeeName = escapeHtml(
            event.employeeName || event.employee || event.collaboratorName || event.matricula || 'Colaborador'
          );
          const typeName = escapeHtml(
            typeof getAbsenceTypeName === 'function' ? getAbsenceTypeName(event.absenceType) : event.absenceType || 'Ausência'
          );
          const notes = escapeHtml(event.eventNotes || event.notes || '');
          const hasNotes = notes && notes.trim().length > 0;
          const normalizedType = (event.absenceType || 'outros').toLowerCase();
          return `
            <li class="absence-summary-item" data-type="${normalizedType}">
              <span class="absence-summary-item-index">${String(index + 1).padStart(2, '0')}</span>
              <div class="absence-summary-item-body">
                <p class="absence-summary-item-name" title="${employeeName}">${employeeName}</p>
                <span class="absence-summary-item-type">${typeName}</span>
                ${hasNotes ? `<span class="absence-summary-item-note">${notes}</span>` : ''}
              </div>
            </li>
          `;
        })
        .join('');

      const remainingCount = todayEvents.length - highlightEvents.length;

      panel.innerHTML = `
        <header class="absence-summary-header">
          <div class="absence-summary-icon" aria-hidden="true">📩</div>
          <div class="absence-summary-header-copy">
            <p class="absence-summary-label">Ausências de hoje</p>
            <time class="absence-summary-date" datetime="${todayStr}">${
        formattedWeekday ? `${formattedWeekday}, ` : ''
      }${formattedDate}</time>
          </div>
          <button type="button" class="absence-summary-close" aria-label="Ocultar alerta de ausências" onclick="hideAbsenceSummaryPanel()">✕</button>
        </header>
        <div class="absence-summary-body">
          <div class="absence-summary-stats" role="group" aria-label="Totais por tipo de ausência">
            ${typeBadges || '<span class="absence-summary-badge absence-summary-badge--empty">Nenhum detalhamento disponível</span>'}
          </div>
          <ul class="absence-summary-list" aria-label="Colaboradores ausentes hoje">
            ${listItems || '<li class="absence-summary-item absence-summary-item--empty">Nenhum colaborador disponível para exibição</li>'}
          </ul>
          ${
        remainingCount > 0
          ? `<p class="absence-summary-more">+${remainingCount} ${remainingCount === 1 ? 'colaborador' : 'colaboradores'} com ausência hoje</p>`
          : ''
      }
        </div>
        <footer class="absence-summary-footer">
          <div class="absence-summary-total" aria-live="off">
            <span class="absence-summary-total-count">${todayEvents.length}</span>
            <span class="absence-summary-total-label">${todayEvents.length === 1 ? 'registro' : 'registros'}</span>
          </div>
          <div class="absence-summary-actions">
            <button type="button" class="absence-summary-action absence-summary-action--primary" onclick="openCalendarModal()">Abrir calendário</button>
            <button type="button" class="absence-summary-action absence-summary-action--ghost" onclick="hideAbsenceSummaryPanel()">Ocultar</button>
          </div>
        </footer>
      `;

      if (panel._autoHideHandle) {
        clearTimeout(panel._autoHideHandle);
      }

      panel.classList.remove('is-visible');
      void panel.offsetWidth;
      panel.classList.add('is-visible');

      panel._autoHideHandle = setTimeout(() => {
        hideAbsenceSummaryPanel();
      }, 12000);
    } else {
      hideAbsenceSummaryPanel();
    }
  }

  function hideAbsenceSummaryPanel() {
    const panel = document.getElementById('absenceSummaryPanel');
    if (panel) {
      if (panel._autoHideHandle) {
        clearTimeout(panel._autoHideHandle);
        panel._autoHideHandle = null;
      }

      panel.classList.remove('is-visible');
      setTimeout(() => {
        if (panel && panel.parentNode) {
          panel.remove();
        }
      }, 350);
    }
  }

  function testAbsenceApplication() {
    console.log('=== TESTE DE APLICAÇÃO DE ausenciaS (CALENDÁRIO EXCLUSIVO) ===');

    const tableRows = document.querySelectorAll('#tableBody13 tr');
    console.log(`Linhas da tabela encontradas: ${tableRows.length}`);

    if (tableRows.length > 0) {
      console.log('Estrutura da primeira linha:');
      const firstRow = tableRows[0];
      const cells = firstRow.cells;

      for (let i = 0; i < cells.length; i++) {
        console.log(`Célula ${i}: "${cells[i].textContent.trim()}"`);
      }

      const ausenciaCell = firstRow.querySelector('.ausencia-select');
      if (ausenciaCell) {
        console.log(`✅ Coluna de ausencia encontrada: "${ausenciaCell.value}" (baseada no calendário)`);
        console.log(`Row index: ${ausenciaCell.getAttribute('data-row-index')}`);
      } else {
        console.log('❌ Coluna de ausencia não encontrada');
      }
    }

    const events = JSON.parse(localStorage.getItem('calendar_events') || '[]');
    console.log(`\nEventos do calendário: ${events.length}`);

    const today = new Date().toISOString().split('T')[0];
    const todayEvents = events.filter((event) => {
      const eventDate = new Date(event.date).toISOString().split('T')[0];
      return eventDate === today;
    });

    console.log(`Eventos para hoje (${today}): ${todayEvents.length}`);

    events.forEach((event, index) => {
      const eventDate = new Date(event.date).toLocaleDateString('pt-BR');
      const isToday = new Date(event.date).toISOString().split('T')[0] === today;
      console.log(`Evento ${index + 1}${isToday ? ' [HOJE]' : ''}: ${event.employeeName} - ${event.absenceType} em ${eventDate}`);
    });

    console.log('\n--- VERIFICAÇÃO DE CORRESPONDÊNCIAS ---');
    todayEvents.forEach((event) => {
      console.log(`\nBuscando na tabela: ${event.employeeName} (ID: ${event.employeeId})`);

      let found = false;
      for (let i = 0; i < tableRows.length; i++) {
        const row = tableRows[i];
        const cells = row.cells;

        if (cells.length === 0) continue;

        const matricula = cells[0] ? cells[0].textContent.trim() : '';
        const colaborador = cells[1] ? cells[1].textContent.trim() : '';

        const eventEmployeeId = event.employeeId || '';
        const eventEmployeeName = (event.employeeName || '').toLowerCase();
        const colaboradorLower = (colaborador || '').toLowerCase();

        if (
          matricula === eventEmployeeId ||
          colaboradorLower.includes(eventEmployeeName) ||
          eventEmployeeName.includes(colaboradorLower)
        ) {
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

  function startAbsenceUpdater() {
    window.testAbsenceApplication = testAbsenceApplication;
    window.gerarRelatorioAusencias = gerarRelatorioAusencias;
    window.resetarAusenciasCalendario = resetarAusenciasCalendario;
    window.obterDadosAtualizados = obterDadosAtualizados;

    updateTableAbsences();
    updateAbsenceSummaryPanel();

    setInterval(() => {
      updateTableAbsences();
    }, 60000);

    console.log('🚀 Sistema de ausencias inicializado (Calendário Exclusivo)');
    console.log('📋 Funções disponíveis no console:');
    console.log('   • testAbsenceApplication() - Teste do sistema');
    console.log('   • gerarRelatorioAusencias() - Relatório detalhado');
    console.log('   • resetarAusenciasCalendario() - Reset completo');
    console.log('   • obterDadosAtualizados() - Status atual');
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

    let employeeValue = '';
    let employeeName = '';

    if (employeeInput.style.display !== 'none') {
      employeeValue = employeeInput.value.trim();
      if (!employeeValue) {
        alert('Por favor, digite a matrícula do colaborador.');
        employeeInput.focus();
        return;
      }

      const employees = getEmployeesFromData();
      const foundEmployee = employees.find(
        (emp) =>
          emp.matricula === employeeValue ||
          emp.matricula.toString() === employeeValue ||
          emp.nome.toLowerCase().includes(employeeValue.toLowerCase())
      );

      if (foundEmployee) {
        employeeName = `${foundEmployee.matricula} - ${foundEmployee.nome}`;
        employeeValue = foundEmployee.matricula.toString();
        console.log(`✅ Colaborador encontrado: ${employeeName}, ID: ${employeeValue}`);
      } else {
        employeeName = employeeValue;
        console.log(`⚠️ Colaborador não encontrado na base, usando: ${employeeValue}`);
      }
    } else {
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

    function checkExistingEvent(checkDate, employeeId) {
      const checkDateStr = checkDate.toISOString().split('T')[0];
      const existingEvent = calendarEvents.find(
        (event) => event.date === checkDateStr && (event.employeeId === employeeId || event.employeeId === employeeId.toString())
      );
      return existingEvent;
    }

    async function createMultipleEvents(duration, typeName, typeIcon) {
      let successCount = 0;
      let failCount = 0;
      let skippedCount = 0;
      let conflictDates = [];

      console.log(`${typeIcon} Criando ${duration} eventos de ${typeName} a partir de ${date.toLocaleDateString('pt-BR')}`);

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

      if (conflictDates.length > 0) {
        const conflictMessage = conflictDates
          .map((conflict) => `• Dia ${conflict.dayNumber} (${conflict.date.toLocaleDateString('pt-BR')}): ${getAbsenceTypeName(conflict.existingType)}`)
          .join('\n');

        const userChoice = confirm(`⚠️ CONFLITO DETECTADO!\n\nO colaborador ${employeeName} já possui eventos nos seguintes dias:\n\n${conflictMessage}\n\n$${
          conflictDates.length === duration
            ? 'TODOS os dias têm conflitos!'
            : `${conflictDates.length} de ${duration} dias têm conflitos.`
        }\n\nDeseja continuar criando apenas os eventos nos dias SEM conflito?\n\n• ✅ SIM: Criar eventos apenas nos dias livres\n• ❌ NÃO: Cancelar toda a operação`);

        if (!userChoice) {
          alert('❌ Operação cancelada pelo usuário devido a conflitos de datas.');
          return;
        }
      }

      for (let i = 0; i < duration; i++) {
        const eventDate = new Date(date);
        eventDate.setDate(date.getDate() + i);

        const existingEvent = checkExistingEvent(eventDate, employeeValue);
        if (existingEvent) {
          skippedCount++;
          console.log(
            `⚠️ Pulando dia ${i + 1}/${duration} (${eventDate.toLocaleDateString('pt-BR')}): Colaborador já tem ${getAbsenceTypeName(existingEvent.absenceType)}`
          );
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
              'Content-Type': 'application/json'
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
          message = `✅ Todos os ${successCount} dias de ${typeName} foram salvos com sucesso!\nPeríodo: ${date.toLocaleDateString('pt-BR')} a ${new Date(
            date.getTime() + (duration - 1) * 24 * 60 * 60 * 1000
          ).toLocaleDateString('pt-BR')}\nColaborador: ${employeeName}`;
        } else {
          message = '📊 Resultado da operação:\n\n';
          if (successCount > 0) message += `✅ Salvos com sucesso: ${successCount} dias\n`;
          if (skippedCount > 0) message += `⚠️ Pulados (conflito): ${skippedCount} dias\n`;
          if (failCount > 0) message += `❌ Falharam: ${failCount} dias\n`;
          message += `\nColaborador: ${employeeName}`;
          if (skippedCount > 0) {
            message += '\n\n💡 Dias pulados já tinham outros eventos marcados.';
          }
        }

        alert(message);
      } else {
        alert(
          `❌ Erro: Não foi possível salvar nenhum evento de ${typeName}.${
            skippedCount > 0
              ? '\n\n⚠️ Todos os dias selecionados já tinham eventos marcados para este colaborador.'
              : ''
          }`
        );
      }
    }

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

    const existingEvent = checkExistingEvent(date, employeeValue);
    if (existingEvent) {
      const confirmReplace = confirm(`⚠️ CONFLITO DETECTADO!\n\nO colaborador ${employeeName} já possui um evento em ${date.toLocaleDateString('pt-BR')}:\n\n${getAbsenceTypeName(
        existingEvent.absenceType
      )}\n\nDeseja substituir o evento existente?\n\n• ✅ SIM: Substituir o evento existente\n• ❌ NÃO: Cancelar operação`);

      if (!confirmReplace) {
        alert('❌ Operação cancelada. O evento existente foi mantido.');
        return;
      }

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

        await loadEventsFromServer();
      } catch (error) {
        console.error('❌ Erro ao excluir evento existente:', error);
        alert('❌ Erro ao excluir o evento existente. Tente novamente.');
        return;
      }
    }

    const eventData = {
      date: date.toISOString().split('T')[0],
      employeeId: employeeValue.toString(),
      employeeName: employeeName,
      absenceType: absenceType,
      notes: notes
    };

    console.log('🎯 Salvando evento no servidor:', eventData);

    try {
      const response = await fetch('/eventos', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        credentials: 'include',
        body: JSON.stringify(eventData)
      });

      const result = await response.json();

      if (response.ok && result.sucesso) {
        console.log('💾 Evento salvo no servidor com sucesso:', result.evento);

        await loadEventsFromServer();

        const today = new Date();
        const eventDate = new Date(date);
        if (eventDate.toDateString() === today.toDateString()) {
          console.log('📅 Evento é para hoje - atualizando tabela');
          refreshTableAbsencesFromCalendar();
        }

        renderCalendar();

        if (selectedDate && selectedDate.toDateString() === date.toDateString()) {
          updateCalendarActionButton();
        }

        closeEventModal();

        alert(
          `Evento salvo com sucesso!\nData: ${date.toLocaleDateString('pt-BR')}\nColaborador: ${employeeName}\nTipo: ${getAbsenceTypeName(absenceType)}`
        );
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
      folga: '🏖️ Folga',
      ferias: '✈️ Ferias',
      atestado: '🏥 Atestado',
      falta: '❌ Falta'
    };
    return types[type] || type;
  }

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

      const eventosPorTipo = {};
      data.eventos.forEach((evento) => {
        const tipo = evento.absenceType || 'sem_tipo';
        eventosPorTipo[tipo] = (eventosPorTipo[tipo] || 0) + 1;
      });

      console.log('📊 Eventos por tipo:', eventosPorTipo);

      const eventosFerias = data.eventos.filter((e) => e.absenceType === 'ferias');
      console.log(`🏖️ Eventos de férias encontrados: ${eventosFerias.length}`);
      console.log('📝 Nota: Eventos de férias NÃO devem ser contados no cálculo de abono');

      return data;
    } catch (error) {
      console.error('❌ Erro:', error);
      return null;
    }
  };

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

  window.testFeriasCreation = window.testMultipleEventsCreation;

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

  async function refreshAllData() {
    console.log('🔄 REFRESH: Iniciando atualização completa dos dados...');

    const refreshBtn = document.getElementById('refreshBtn');
    if (!refreshBtn) return;
    const originalHTML = refreshBtn.innerHTML;

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

    const style = document.createElement('style');
    style.textContent = `
      @keyframes spin {
        from { transform: rotate(0deg); }
        to { transform: rotate(360deg); }
      }
    `;
    document.head.appendChild(style);

    try {
      console.log('🔄 REFRESH: Carregando dados da API...');
      await carregarDadosAPI();

      console.log('🔄 REFRESH: Atualizando calendário...');
      if (typeof renderCalendar === 'function') {
        renderCalendar();
      }

      console.log('🔄 REFRESH: Atualizando data atual...');
      if (typeof updateCurrentDate === 'function') {
        updateCurrentDate();
      }

      console.log('🔄 REFRESH: Atualizando sistema de compensação...');
      if (typeof updateAbsenceSummaryPanel === 'function') {
        updateAbsenceSummaryPanel();
      }

      console.log('🔄 REFRESH: Atualizando tabelas...');
      if (typeof updateTableAbsences === 'function') {
        updateTableAbsences();
      }

      console.log('✅ REFRESH: Atualização completa realizada com sucesso!');

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

      setTimeout(() => {
        refreshBtn.style.removeProperty('background');
        refreshBtn.innerHTML = originalHTML;
        refreshBtn.disabled = false;
        refreshBtn.blur();
        if (style.parentNode) {
          style.parentNode.removeChild(style);
        }
      }, 2000);
    } catch (error) {
      console.error('❌ REFRESH: Erro durante atualização:', error);

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

      setTimeout(() => {
        refreshBtn.style.removeProperty('background');
        refreshBtn.innerHTML = originalHTML;
        refreshBtn.disabled = false;
        refreshBtn.blur();
        if (style.parentNode) {
          style.parentNode.removeChild(style);
        }
      }, 3000);

      alert('Erro ao atualizar os dados. Verifique sua conexão e tente novamente.');
    }
  }

  function applyAbsenceTypeVisibility() {
    const absenceTypeSelect = document.getElementById('absenceType');
    const feriasDurationGroup = document.getElementById('feriassDurationGroup');
    const atestadoDurationGroup = document.getElementById('atestadoDurationGroup');
    const folgaDurationGroup = document.getElementById('folgaDurationGroup');

    if (!absenceTypeSelect || !feriasDurationGroup || !atestadoDurationGroup || !folgaDurationGroup) {
      return;
    }

    feriasDurationGroup.style.display = 'none';
    atestadoDurationGroup.style.display = 'none';
    folgaDurationGroup.style.display = 'none';

    if (absenceTypeSelect.value === 'ferias') {
      feriasDurationGroup.style.display = 'block';
    } else if (absenceTypeSelect.value === 'atestado') {
      atestadoDurationGroup.style.display = 'block';
    } else if (absenceTypeSelect.value === 'folga') {
      folgaDurationGroup.style.display = 'block';
    }
  }

  function resetEmployeeSelectionMode() {
    const toggleBtn = document.getElementById('toggleEmployeeSelect');
    const employeeInput = document.getElementById('employeeInput');
    const employeeSelect = document.getElementById('employeeSelect');
    const container = document.querySelector('.employee-input-container');

    if (!toggleBtn || !employeeInput || !employeeSelect || !container) {
      return;
    }

    employeeInput.style.display = 'block';
    employeeSelect.style.display = 'none';
    container.style.display = 'flex';
    toggleBtn.textContent = '📋';
    toggleBtn.title = 'Alternar para lista';
    toggleBtn.dataset.mode = 'input';
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

      if (typeof window.downloadAuthenticatedFile !== 'function') {
        throw new Error('Função de download autenticado não está disponível.');
      }

      const filename = `eventos_${start}_a_${end}.xlsx`;
      await window.downloadAuthenticatedFile(
        `/eventos/exportar?inicio=${encodeURIComponent(start)}&fim=${encodeURIComponent(end)}`,
        filename
      );
      closeExportModal();
    } catch (err) {
      console.error('Erro ao exportar eventos:', err);
      alert(err.message || 'Erro ao exportar eventos. Veja o console para detalhes.');
    }
  }

  function openEventModal(date) {
    const modal = document.getElementById('eventModal');
    const eventDateInput = document.getElementById('eventDate');
    const absenceTypeSelect = document.getElementById('absenceType');

    if (!modal || !eventDateInput || !absenceTypeSelect) {
      return;
    }

    const formattedDate = date.toLocaleDateString('pt-BR', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });

    eventDateInput.value = formattedDate;
    selectedDate = date;
    resetEmployeeSelectionMode();
    populateEmployeeDatalist();
    setupToggleButton();
    absenceTypeSelect.onchange = applyAbsenceTypeVisibility;
    applyAbsenceTypeVisibility();

    setTimeout(() => {
      checkEmployeeConflicts();
    }, 100);

    modal.style.display = '';
    modal.classList.add('show');
  }

  function closeEventModal() {
    const modal = document.getElementById('eventModal');
    if (modal) {
      modal.classList.remove('show');
      setTimeout(() => {
        if (!modal.classList.contains('show')) {
          modal.style.display = 'none';
        }
      }, 100);
    }

    hideConflictWarning();
    resetEmployeeSelectionMode();

    const employeeInput = document.getElementById('employeeInput');
    const employeeSelect = document.getElementById('employeeSelect');
    const absenceType = document.getElementById('absenceType');
    const feriasDuration = document.getElementById('feriassDuration');
    const atestadoDuration = document.getElementById('atestadoDuration');
    const folgaDuration = document.getElementById('folgaDuration');
    const eventNotes = document.getElementById('eventNotes');

    if (employeeInput) employeeInput.value = '';
    if (employeeSelect) employeeSelect.value = '';
    if (absenceType) absenceType.value = '';
    if (feriasDuration) feriasDuration.value = '1';
    if (atestadoDuration) atestadoDuration.value = '1';
    if (folgaDuration) folgaDuration.value = '1';
    if (eventNotes) eventNotes.value = '';

    applyAbsenceTypeVisibility();
  }

  function populateEmployeeDatalist() {
    const employeeList = document.getElementById('employeeList');
    const employeeInput = document.getElementById('employeeInput');
    const employeeSelect = document.getElementById('employeeSelect');

    if (!employeeList || !employeeInput || !employeeSelect) {
      return;
    }

    employeeList.innerHTML = '';
    const employees = getEmployeesFromData();

    employees.forEach((employee) => {
      const option = document.createElement('option');
      option.value = employee.matricula;
      option.textContent = employee.estaAusente
        ? `${employee.matricula} - ${employee.nome} [AUSENTE: ${employee.statusAusencia.toUpperCase()}]`
        : `${employee.matricula} - ${employee.nome}`;
      employeeList.appendChild(option);
    });

    populateEmployeeSelect();

    employeeInput.oninput = function() {
      const searchValue = this.value.toLowerCase();
      const filtered = employees.filter(
        (emp) => emp.matricula.toLowerCase().includes(searchValue) || emp.nome.toLowerCase().includes(searchValue)
      );

      employeeList.innerHTML = '';
      filtered.forEach((employee) => {
        const option = document.createElement('option');
        option.value = employee.matricula;
        option.textContent = employee.estaAusente
          ? `${employee.matricula} - ${employee.nome} [AUSENTE: ${employee.statusAusencia.toUpperCase()}]`
          : `${employee.matricula} - ${employee.nome}`;
        employeeList.appendChild(option);
      });

      checkEmployeeConflicts();
    };

    employeeSelect.onchange = checkEmployeeConflicts;
  }

  function setupToggleButton() {
    const toggleBtn = document.getElementById('toggleEmployeeSelect');
    const employeeInput = document.getElementById('employeeInput');
    const employeeSelect = document.getElementById('employeeSelect');
    const container = document.querySelector('.employee-input-container');

    if (!toggleBtn || !employeeInput || !employeeSelect || !container) {
      return;
    }

    if (!toggleBtn.dataset.mode) {
      toggleBtn.dataset.mode = 'input';
    }

    toggleBtn.onclick = function() {
      const isSelectMode = toggleBtn.dataset.mode === 'select';

      if (isSelectMode) {
        employeeInput.style.display = 'block';
        employeeSelect.style.display = 'none';
        container.style.display = 'flex';
        toggleBtn.textContent = '📋';
        toggleBtn.title = 'Alternar para lista';
        toggleBtn.dataset.mode = 'input';
      } else {
        employeeInput.style.display = 'none';
        employeeSelect.style.display = 'block';
        container.style.display = 'block';
        toggleBtn.textContent = '✏️';
        toggleBtn.title = 'Alternar para digitação';
        toggleBtn.dataset.mode = 'select';
      }

      checkEmployeeConflicts();
    };
  }

  function addAbsenceIndicators(totalAusentes) {
    const headerIndicator = document.querySelector('.absence-indicator[data-role="header-indicator"]');
    const today = new Date();
    const todayStr = getLocalDateKey(today);

    if (headerIndicator) {
      const valueNode = headerIndicator.querySelector('.indicator-value');
      let totalHoje = typeof totalAusentes === 'number' ? totalAusentes : null;

      if (totalHoje === null) {
        if (Array.isArray(window.calendarEvents) && window.calendarEvents.length) {
          totalHoje = window.calendarEvents.filter((event) => {
            return getLocalDateKey(event.date) === todayStr;
          }).length;
        } else {
          const selects = document.querySelectorAll('#tableBody13 .ausencia-select');
          totalHoje = Array.from(selects).filter((select) => select.value && select.value.trim() !== '').length;
        }
      }

      if (valueNode) {
        valueNode.textContent = totalHoje !== null ? String(totalHoje) : '--';
      }
    }

    if (!Array.isArray(window.calendarEvents) || window.calendarEvents.length === 0) {
      clearAbsenceIndicators();
      return;
    }

    clearAbsenceIndicators();

    const eventsByEmployee = window.calendarEvents.reduce((acc, event) => {
      if (!event || !event.employeeId) return acc;
      const eventDate = parseLocalDate(event.date);
      const eventDateStr = getLocalDateKey(event.date);

      if (!eventDate || !eventDateStr) return acc;

      if (eventDateStr < todayStr) return acc;

      const employeeId = String(event.employeeId);
      if (!acc[employeeId]) acc[employeeId] = [];
      acc[employeeId].push({
        date: eventDate,
        raw: event
      });
      return acc;
    }, {});

    const rows = document.querySelectorAll('#tableBody13 tr');
    rows.forEach((row) => {
      const matriculaCell = row.querySelector('td[data-column-key="Matrícula"]');
      if (!matriculaCell) return;

      const matricula = (matriculaCell.textContent || '').trim();
      if (!matricula || !eventsByEmployee[matricula]) return;

      const futureEvents = eventsByEmployee[matricula]
        .slice()
        .sort((a, b) => a.date - b.date);

      const nextEvent = futureEvents[0];
      if (!nextEvent) return;

      const indicator = document.createElement('span');
      indicator.className = 'absence-indicator';
      indicator.dataset.origin = 'table';
      indicator.dataset.type = String(nextEvent.raw.absenceType || 'outros').toLowerCase();

      const daysDiff = Math.max(0, getLocalDayDiff(nextEvent.date, today));
      const dayLabel = daysDiff === 0 ? 'hoje' : `${daysDiff} dia${daysDiff > 1 ? 's' : ''}`;
      indicator.title = `Ausência programada: ${getAbsenceTypeName(nextEvent.raw.absenceType)} em ${nextEvent.date.toLocaleDateString('pt-BR')} (${dayLabel})`;

      if (matriculaCell.style.position === '' || getComputedStyle(matriculaCell).position === 'static') {
        matriculaCell.style.position = 'relative';
      }

      const badgeLabels = {
        folga: 'Folga',
        ferias: 'Ferias',
        atestado: 'Atest.',
        falta: 'Falta'
      };
      const tooltipLabels = {
        folga: 'Folga',
        ferias: 'Ferias',
        atestado: 'Atestado',
        falta: 'Falta'
      };
      const absenceType = indicator.dataset.type;
      const badgeLabel = badgeLabels[absenceType] || 'Ausencia';
      const tooltipLabel = tooltipLabels[absenceType] || 'Ausencia';
      const badgeDate = nextEvent.date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
      indicator.title = `Ausencia programada: ${tooltipLabel} em ${nextEvent.date.toLocaleDateString('pt-BR')} (${dayLabel})`;
      indicator.innerHTML = `<span class="absence-indicator__label">${badgeLabel}</span><span class="absence-indicator__date">${badgeDate}</span>`;

      matriculaCell.appendChild(indicator);
    });
  }

  function startAbsenceUpdater() {
    window.testAbsenceApplication = testAbsenceApplication;
    window.gerarRelatorioAusencias = gerarRelatorioAusencias;
    window.resetarAusenciasCalendario = resetarAusenciasCalendario;
    window.obterDadosAtualizados = obterDadosAtualizados;

    updateTableAbsences();
    updateAbsenceSummaryPanel();

    if (window.__absenceUpdaterInterval) {
      clearInterval(window.__absenceUpdaterInterval);
    }

    window.__absenceUpdaterInterval = setInterval(() => {
      updateTableAbsences();
    }, 60000);

    console.log('Sistema de ausencias inicializado (Calendário Exclusivo)');
  }

  window.calendarModule = {
    openCalendarModal,
    closeCalendarModal,
    selectOption,
    openExportModal,
    closeExportModal,
    exportEventsByPeriod,
    openCalendarViewModal,
    closeCalendarViewModal,
    renderCalendar,
    goToToday,
    addEventToSelectedDate,
    updateCalendarActionButton,
    showEventsForSelectedDate,
    openEventsViewModal,
    createEventsViewModal,
    closeEventsViewModal,
    addEventToCurrentDate,
    deleteEventFromView,
    openEventModal,
    closeEventModal,
    populateEmployeeSelect,
    populateEmployeeDatalist,
    checkEmployeeConflicts,
    showConflictWarning,
    hideConflictWarning,
    viewExistingEvent,
    setupToggleButton,
    testDataAccess,
    getEmployeesFromData,
    clearAbsenceIndicators,
    addAbsenceIndicators,
    addIndicatorStyles,
    updateTableAbsences,
    createAbsenceSummaryPanel,
    updateAbsenceSummaryPanel,
    hideAbsenceSummaryPanel,
    testAbsenceApplication,
    startAbsenceUpdater,
    saveEvent,
    getAbsenceTypeName,
    refreshAllData
  };
})();
