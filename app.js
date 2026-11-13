'use strict';
/* =========================================================
   Sports Facility Booking - client-side only (vanilla JS)
   Sections: 1 Constants/state, 2 Helpers, 3 Data, 4 Rules,
   5 Rendering, 6 Booking form, 7 Actions, 8 Maintenance, 9 Start-up
   ========================================================= */

/* ---------- 1. Constants and state ---------- */
const OPEN_HOUR = 8;            // opening hours 08:00 to 22:00
const CLOSE_HOUR = 22;
const MAX_DURATION = 3;         // longest allowed booking (hours)
const APPROVAL_OVER_HOURS = 2;  // longer than this needs manager approval
const MAX_DAYS_AHEAD = 30;
const STORAGE_KEY = 'sportsFacilityBookingData';
const ACTIVE_STATUSES = ['Pending', 'Approved']; // statuses that block a slot

let facilities = [];
let bookings = [];
let blocks = [];                // maintenance blocks
let currentRole = 'Member';
let editingId = null;           // id of the booking being edited (FR6)
let pendingAction = null;       // action waiting for confirmation in the panel
let idCounter = 1000;

const $ = (id) => document.getElementById(id);

/* ---------- 2. Small helpers ---------- */
function pad(n) { return String(n).padStart(2, '0'); }
function toDateString(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
function todayString() { return toDateString(new Date()); }
function addDays(dateStr, n) {
  const d = new Date(dateStr + 'T12:00:00');
  d.setDate(d.getDate() + n);
  return toDateString(d);
}
function hourOf(timeStr) { return parseInt(timeStr.split(':')[0], 10); }   // "10:00" -> 10
function hourLabel(h) { return pad(h) + ':00'; }
function slotStart(dateStr, h) { return new Date(dateStr + 'T' + pad(h) + ':00:00'); }
function money(n) { return n.toFixed(2) + ' units'; }
function newId(prefix) { idCounter += 1; return prefix + idCounter; }
function getFacility(id) { return facilities.find((f) => f.id === id); }
function currentEmail() { return $('currentEmail').value.trim().toLowerCase(); }
function isOwn(booking) { return booking.email.toLowerCase() === currentEmail(); }
// Escape text before putting it into innerHTML (prevents HTML injection)
function escapeHtml(text) {
  const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  return String(text).replace(/[&<>"']/g, (c) => map[c]);
}
function showMessage(text, kind) {
  const box = $('globalMessage');
  box.textContent = text;
  box.className = 'message ' + (kind || '');
}

/* ---------- 3. Data (sample data, storage) ---------- */
function buildSampleData() {
  const t = todayString();
  facilities = [
    { id: 'f1', name: 'Court A', type: 'Basketball', capacity: 10, pricePerHour: 20, status: 'Open' },
    { id: 'f2', name: 'Court B', type: 'Badminton', capacity: 4, pricePerHour: 12, status: 'Open' },
    { id: 'f3', name: 'Main Pitch', type: 'Football', capacity: 22, pricePerHour: 40, status: 'Open' },
    { id: 'f4', name: 'Tennis Court 1', type: 'Tennis', capacity: 4, pricePerHour: 18, status: 'Open' },
    { id: 'f5', name: 'Swimming Lane Pool', type: 'Swimming', capacity: 20, pricePerHour: 15, status: 'Open' },
    { id: 'f6', name: 'Squash Court', type: 'Squash', capacity: 2, pricePerHour: 10, status: 'Open' },
    { id: 'f7', name: 'Table Tennis Hall', type: 'Table Tennis', capacity: 4, pricePerHour: 8, status: 'Open' },
    { id: 'f8', name: 'Volleyball Court', type: 'Volleyball', capacity: 12, pricePerHour: 25, status: 'Open' }
  ];
  // Dates are relative to today so the sample data is never in the past
  const make = (id, fid, name, email, days, start, duration, type, team, players, status, fee, reason) => {
    const f = facilities.find((x) => x.id === fid);
    return { id, facilityId: fid, memberName: name, email, date: addDays(t, days), start, duration, type,
             teamName: team, players, status, cost: f.pricePerHour * duration, fee, reason };
  };
  bookings = [
    make('b1', 'f2', 'Sam Student', 'student@uni.edu', 1, '09:00', 1, 'Individual', '', 0, 'Approved', 0, ''),
    make('b2', 'f4', 'Sam Student', 'student@uni.edu', 3, '14:00', 3, 'Individual', '', 0, 'Pending', 0, ''),
    make('b3', 'f3', 'Lina Captain', 'lina@uni.edu', 4, '16:00', 2, 'Team', 'Falcons FC', 18, 'Pending', 0, ''),
    make('b4', 'f1', 'Omar Khan', 'omar@uni.edu', 2, '10:00', 1, 'Individual', '', 0, 'Approved', 0, ''),
    make('b5', 'f3', 'Lina Captain', 'lina@uni.edu', 5, '18:00', 3, 'Team', 'Eagles', 15, 'Rejected', 0, 'Pitch reserved for a league match.'),
    make('b6', 'f6', 'Sam Student', 'student@uni.edu', 6, '12:00', 1, 'Individual', '', 0, 'Cancelled', 0, ''),
    make('b7', 'f5', 'Maya Ortiz', 'maya@uni.edu', 1, '08:00', 2, 'Individual', '', 0, 'Approved', 0, ''),
    make('b8', 'f8', 'Sam Student', 'student@uni.edu', 7, '17:00', 3, 'Individual', '', 0, 'Pending', 0, '')
  ];
  blocks = [
    { id: 'm1', facilityId: 'f2', date: addDays(t, 2), start: '13:00', end: '16:00', reason: 'Net replacement' },
    { id: 'm2', facilityId: 'f1', date: addDays(t, 3), start: '08:00', end: '10:00', reason: 'Floor polishing' }
  ];
}

function saveData() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ facilities, bookings, blocks }));
  } catch (error) { /* storage unavailable: app still works in memory */ }
}

function loadData() {
  let saved = null;
  try { saved = JSON.parse(localStorage.getItem(STORAGE_KEY)); } catch (error) { saved = null; }
  if (saved && Array.isArray(saved.facilities) && saved.facilities.length > 0 &&
      Array.isArray(saved.bookings) && Array.isArray(saved.blocks)) {
    facilities = saved.facilities; bookings = saved.bookings; blocks = saved.blocks;
  } else {
    buildSampleData();
  }
  // Keep new ids unique after a reload
  const numbers = bookings.concat(blocks).map((x) => parseInt(x.id.slice(1), 10) || 0);
  idCounter = Math.max(1000, ...numbers);
}

// Approved bookings whose end time has passed become Completed (FR14)
function markCompletedBookings() {
  const now = new Date();
  bookings.forEach((b) => {
    if (b.status === 'Approved' && slotStart(b.date, hourOf(b.start) + b.duration) < now) b.status = 'Completed';
  });
}

/* ---------- 4. Rules: conflicts, slots, cancellation ---------- */
// Returns the first booking or maintenance block that overlaps, or null (FR8, FR9)
function findConflict(facilityId, date, startH, duration, ignoreId) {
  const endH = startH + duration;
  for (const b of bookings) {
    if (b.id === ignoreId || b.facilityId !== facilityId || b.date !== date) continue;
    if (!ACTIVE_STATUSES.includes(b.status)) continue;
    const s = hourOf(b.start);
    if (startH < s + b.duration && s < endH) return { kind: 'booking', from: s, to: s + b.duration, status: b.status };
  }
  for (const bl of blocks) {
    if (bl.facilityId !== facilityId || bl.date !== date) continue;
    const s = hourOf(bl.start), e = hourOf(bl.end);
    if (startH < e && s < endH) return { kind: 'maintenance', from: s, to: e, reason: bl.reason };
  }
  return null;
}

function conflictMessage(c) {
  if (c.kind === 'maintenance') {
    return 'That time overlaps a maintenance block (' + hourLabel(c.from) + ' to ' + hourLabel(c.to) + ', ' + c.reason + ').';
  }
  return 'That time overlaps a ' + c.status + ' booking (' + hourLabel(c.from) + ' to ' + hourLabel(c.to) + ').';
}

// Status of one hourly slot for the calendar (FR2)
function getSlotStatus(facilityId, date, h) {
  const inBlock = blocks.some((bl) => bl.facilityId === facilityId && bl.date === date &&
                                      h >= hourOf(bl.start) && h < hourOf(bl.end));
  if (inBlock) return 'Maintenance';
  const booking = bookings.find((b) => b.facilityId === facilityId && b.date === date &&
    ACTIVE_STATUSES.includes(b.status) && h >= hourOf(b.start) && h < hourOf(b.start) + b.duration);
  if (booking) return booking.status === 'Approved' ? 'Booked' : 'Pending';
  if (slotStart(date, h) <= new Date()) return 'Past';
  return 'Available';
}

function countFreeSlots(facilityId, date) {
  let count = 0;
  for (let h = OPEN_HOUR; h < CLOSE_HOUR; h++) if (getSlotStatus(facilityId, date, h) === 'Available') count++;
  return count;
}

// Find the next free start time, searching the rest of the day and the following days (FR11)
function findNextSlot(facilityId, date, startH, duration, ignoreId) {
  for (let day = 0; day <= MAX_DAYS_AHEAD; day++) {
    const d = addDays(date, day);
    const firstHour = day === 0 ? startH + 1 : OPEN_HOUR;
    for (let h = firstHour; h + duration <= CLOSE_HOUR; h++) {
      if (slotStart(d, h) > new Date() && !findConflict(facilityId, d, h, duration, ignoreId)) {
        return { date: d, start: hourLabel(h) };
      }
    }
  }
  return null;
}

// Cancellation policy (FR12): >24h free, <=24h 50% fee, none after start
function calcCancellation(booking) {
  const hoursLeft = (slotStart(booking.date, hourOf(booking.start)) - new Date()) / 3600000;
  if (hoursLeft <= 0) return { allowed: false, fee: 0 };
  if (hoursLeft > 24) return { allowed: true, fee: 0 };
  return { allowed: true, fee: booking.cost * 0.5 };
}

/* ---------- 5. Rendering ---------- */
function renderAll() {
  document.body.dataset.role = currentRole;
  renderFacilities();
  renderSchedule();
  renderBookings();
  renderBlocks();
  renderSummary();
}

function renderFacilities() {
  const type = $('typeFilter').value;
  const minCap = Number($('capacityFilter').value) || 0;
  const onlyFree = $('availFilter').value === 'free';
  const date = $('date').value;
  const list = facilities.filter((f) =>
    (!type || f.type === type) && f.capacity >= minCap && (!onlyFree || !date || countFreeSlots(f.id, date) > 0));

  $('facilityList').innerHTML = list.map((f) => {
    const free = date ? countFreeSlots(f.id, date) + ' free slots on ' + date : 'Pick a date to see free slots';
    const selected = f.id === $('facility').value ? ' selected' : '';
    return '<article class="card' + selected + '">' +
      '<h3>' + escapeHtml(f.name) + '</h3>' +
      '<dl><dt>Type</dt><dd>' + escapeHtml(f.type) + '</dd>' +
      '<dt>Capacity</dt><dd>' + f.capacity + '</dd>' +
      '<dt>Price</dt><dd>' + f.pricePerHour + ' units/hour</dd>' +
      '<dt>Status</dt><dd>' + escapeHtml(f.status) + '</dd></dl>' +
      '<p>' + free + '</p>' +
      '<button type="button" data-facility="' + f.id + '">View schedule and book</button></article>';
  }).join('');
  $('facilityEmpty').hidden = list.length > 0;
}

function renderSchedule() {
  const date = $('date').value;
  const facility = getFacility($('facility').value);
  if (!facility || !date) {
    $('scheduleHint').textContent = 'Choose a facility and a date to see its schedule.';
    $('scheduleList').innerHTML = '';
    return;
  }
  $('scheduleHint').textContent = facility.name + ' on ' + date + ' (08:00 to 22:00).';
  const symbols = { Pending: '◔', Booked: '✖', Maintenance: '⚒', Past: '–' };
  let html = '';
  for (let h = OPEN_HOUR; h < CLOSE_HOUR; h++) {
    const status = getSlotStatus(facility.id, date, h);
    html += '<li class="slot slot-' + status.toLowerCase() + '"><span class="slot-time">' +
      hourLabel(h) + ' to ' + hourLabel(h + 1) + '</span>';
    if (status === 'Available') {
      html += '<button type="button" class="secondary" data-hour="' + h + '">✔ Available: pick</button>';
    } else {
      html += '<span>' + symbols[status] + ' ' + status + '</span>';
    }
    html += '</li>';
  }
  $('scheduleList').innerHTML = html;
}

// Returns the bookings the current role is allowed to see (before filters)
function bookingsForRole() {
  return bookings.filter((b) => currentRole === 'Manager' || isOwn(b));
}

function renderBookings() {
  const status = $('statusFilter').value;
  const date = $('dateFilter').value;
  const allMine = bookingsForRole();
  const list = allMine.filter((b) => (!status || b.status === status) && (!date || b.date === date))
    .sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start));

  $('tableWrap').hidden = list.length === 0;
  $('bookingEmpty').hidden = list.length > 0;
  if (list.length === 0) {
    $('bookingEmpty').textContent = allMine.length === 0
      ? (currentRole === 'Manager' ? 'There are no bookings yet.' : 'You have no bookings yet.')
      : 'No bookings match your filters.';
  }

  $('bookingBody').innerHTML = list.map((b) => {
    const f = getFacility(b.facilityId);
    const end = hourOf(b.start) + b.duration;
    const cost = b.status === 'Cancelled' ? 'Fee ' + money(b.fee) : money(b.cost);
    const who = escapeHtml(b.memberName) + (b.type === 'Team' ? ' (Team: ' + escapeHtml(b.teamName) + ', ' + b.players + ' players)' : '');
    const reason = b.reason ? '<span class="reason">Reason: ' + escapeHtml(b.reason) + '</span>' : '';
    let actions = '';
    if (currentRole === 'Member' && isOwn(b)) {
      if (b.status === 'Pending') actions += '<button type="button" class="secondary" data-action="edit" data-id="' + b.id + '">Change date/time</button>';
      if (b.status === 'Pending' || b.status === 'Approved') actions += '<button type="button" class="danger" data-action="cancel" data-id="' + b.id + '">Cancel</button>';
    }
    if (currentRole === 'Manager' && b.status === 'Pending') {
      actions += '<button type="button" data-action="approve" data-id="' + b.id + '">Approve</button>' +
                 '<button type="button" class="danger" data-action="reject" data-id="' + b.id + '">Reject</button>';
    }
    return '<tr><td data-label="Facility">' + escapeHtml(f ? f.name : 'Unknown') + '</td>' +
      '<td data-label="Date">' + b.date + '</td>' +
      '<td data-label="Time">' + b.start + ' to ' + hourLabel(end) + '</td>' +
      '<td data-label="Member">' + who + '</td>' +
      '<td data-label="Status"><span class="status status-' + b.status.toLowerCase() + '">' + b.status + '</span>' + reason + '</td>' +
      '<td data-label="Cost">' + cost + '</td>' +
      '<td class="actions">' + (actions || '<span class="hint">No actions</span>') + '</td></tr>';
  }).join('');
}

function renderBlocks() {
  const sorted = blocks.slice().sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start));
  $('blockEmpty').hidden = sorted.length > 0;
  $('blockList').innerHTML = sorted.map((bl) => {
    const f = getFacility(bl.facilityId);
    return '<li><span>' + escapeHtml(f ? f.name : '') + ': ' + bl.date + ', ' + bl.start + ' to ' + bl.end +
      ' (' + escapeHtml(bl.reason) + ')</span>' +
      '<button type="button" class="secondary" data-remove-block="' + bl.id + '">Remove</button></li>';
  }).join('');
}

// Counts update live (dynamic results)
function renderSummary() {
  const mine = bookingsForRole();
  const count = (s) => mine.filter((b) => b.status === s).length;
  const shown = $('facilityList').children.length;
  $('summaryList').innerHTML =
    '<li>Facilities shown: ' + shown + ' of ' + facilities.length + '</li>' +
    '<li>' + (currentRole === 'Manager' ? 'All bookings: ' : 'My bookings: ') + mine.length + '</li>' +
    '<li>Pending: ' + count('Pending') + '</li>' +
    '<li>Approved: ' + count('Approved') + '</li>' +
    '<li>Maintenance blocks: ' + blocks.length + '</li>';
}

/* ---------- 6. Booking form: validation, live check, submit ---------- */
function setError(id, message) {
  const span = $('err-' + id);
  if (span) span.textContent = message;
  const input = $(id);
  if (input) input.setAttribute('aria-invalid', message ? 'true' : 'false');
}
function clearErrors(ids) { ids.forEach((id) => setError(id, '')); }

// Turns browser validation (required, type, pattern, min, max) into a message next to the field
function fieldMessage(id) {
  const input = $(id);
  if (input.checkValidity()) return '';
  const v = input.validity;
  if (v.valueMissing) return 'This field is required.';
  if (v.typeMismatch) return 'Enter a valid value, for example name@example.com.';
  if (v.patternMismatch) return input.title || 'Value is not in the expected format.';
  if (v.badInput) return 'Enter a valid value.';
  if (v.rangeUnderflow) return id.toLowerCase().includes('date') ? 'The date cannot be in the past.' : 'The value must be at least ' + input.min + '.';
  if (v.rangeOverflow) return id.toLowerCase().includes('date') ? 'Bookings are only possible in the next ' + MAX_DAYS_AHEAD + ' days.' : 'The value must be at most ' + input.max + '.';
  return input.validationMessage;
}

function readBookingForm() {
  return {
    memberName: $('memberName').value.trim(),
    email: $('email').value.trim(),
    facilityId: $('facility').value,
    date: $('date').value,
    start: $('start').value,
    duration: Number($('duration').value),
    type: document.querySelector('input[name="bookingType"]:checked').value,
    teamName: $('teamName').value.trim(),
    players: Number($('players').value) || 0
  };
}

const BOOKING_FIELDS = ['memberName', 'email', 'facility', 'date', 'start', 'duration', 'teamName', 'players'];

// Checks everything: browser rules first, then JavaScript-only rules (FR10, FR18)
function validateBookingForm() {
  clearErrors(BOOKING_FIELDS);
  const data = readBookingForm();
  const problems = [];
  const fail = (id, message) => { setError(id, message); problems.push(id); };

  const toCheck = ['memberName', 'email', 'facility', 'date', 'start', 'duration'];
  if (data.type === 'Team') toCheck.push('teamName', 'players');
  toCheck.forEach((id) => { const m = fieldMessage(id); if (m) fail(id, m); });

  const facility = getFacility(data.facilityId);
  if (data.type === 'Team' && facility && data.players > facility.capacity && !problems.includes('players')) {
    fail('players', facility.name + ' holds at most ' + facility.capacity + ' players.');
  }
  if (!problems.includes('duration') && (data.duration < 1 || data.duration > MAX_DURATION)) {
    fail('duration', 'Duration must be 1 to ' + MAX_DURATION + ' hours.');
  }
  if (!problems.includes('date') && !problems.includes('start') && !problems.includes('duration')) {
    const startH = hourOf(data.start);
    if (startH < OPEN_HOUR || startH + data.duration > CLOSE_HOUR) {
      fail('start', 'The booking must be inside opening hours (08:00 to 22:00).');
    } else if (slotStart(data.date, startH) <= new Date()) {
      fail('start', 'That time has already passed. Choose a future time.');
    } else {
      const conflict = findConflict(data.facilityId, data.date, startH, data.duration, editingId);
      if (conflict) fail('start', conflictMessage(conflict));
    }
  }
  updateLiveCheck(); // also shows the next available slot suggestion
  return { ok: problems.length === 0, data, firstBad: problems[0] };
}

// Live feedback while typing: cost and conflict (calculation + availability interactions)
function updateLiveCheck() {
  const d = readBookingForm();
  const facility = getFacility(d.facilityId);
  const live = $('liveCheck');
  $('costOutput').textContent = facility ? money(facility.pricePerHour * d.duration) : '—';
  $('suggestion').innerHTML = '';
  live.className = 'live';
  if (!facility || !d.date || !d.start) { live.textContent = ''; return; }

  const startH = hourOf(d.start);
  let conflict = null;
  if (startH + d.duration > CLOSE_HOUR) {
    live.textContent = 'This booking would end after closing time (22:00).';
    live.className = 'live bad';
    return;
  }
  if (slotStart(d.date, startH) <= new Date()) {
    live.textContent = 'That time is in the past.';
    live.className = 'live bad';
    return;
  }
  conflict = findConflict(d.facilityId, d.date, startH, d.duration, editingId);
  if (conflict) {
    live.textContent = conflictMessage(conflict);
    live.className = 'live bad';
    const next = findNextSlot(d.facilityId, d.date, startH, d.duration, editingId);
    $('suggestion').innerHTML = next
      ? 'Next available slot: ' + next.date + ' at ' + next.start + '. <button type="button" class="secondary" id="useSuggestion" data-date="' + next.date + '" data-start="' + next.start + '">Use this slot</button>'
      : 'No free slot of this length in the next ' + MAX_DAYS_AHEAD + ' days.';
  } else {
    live.textContent = '✔ This time is free.';
    live.className = 'live good';
  }
}

function toggleTeamFields() {
  const isTeam = readBookingForm().type === 'Team';
  $('teamFields').hidden = !isTeam;
  $('teamName').required = isTeam;
  $('players').required = isTeam;
}

// Called whenever a form value changes
function refreshBookingForm() {
  toggleTeamFields();
  updateLiveCheck();
  renderSchedule();
  renderFacilities();
  renderSummary();
}

function setFormMessage(text, kind) {
  $('formMessage').textContent = text;
  $('formMessage').className = 'message ' + (kind || '');
}

function resetBookingForm() {
  $('bookingForm').reset();
  editingId = null;
  clearErrors(BOOKING_FIELDS);
  $('email').value = $('currentEmail').value.trim();
  $('facility').selectedIndex = 0;
  $('date').value = addDays(todayString(), 1);
  $('formTitle').textContent = 'New booking request';
  $('submitBtn').textContent = 'Request booking';
  $('cancelEditBtn').hidden = true;
  refreshBookingForm();
}

function handleBookingSubmit(event) {
  event.preventDefault();
  const result = validateBookingForm();
  if (!result.ok) {
    setFormMessage('Please fix the errors shown in the form.', 'bad');
    $(result.firstBad).focus();
    return;
  }
  const d = result.data;
  const facility = getFacility(d.facilityId);
  const needsApproval = d.type === 'Team' || d.duration > APPROVAL_OVER_HOURS; // FR13
  const fields = {
    facilityId: d.facilityId, memberName: d.memberName, email: d.email, date: d.date, start: d.start,
    duration: d.duration, type: d.type, teamName: d.type === 'Team' ? d.teamName : '',
    players: d.type === 'Team' ? d.players : 0, cost: facility.pricePerHour * d.duration,
    status: needsApproval ? 'Pending' : 'Approved'
  };
  if (editingId) {
    Object.assign(bookings.find((b) => b.id === editingId), fields);
    showMessage('Booking updated. Status: ' + fields.status + '.', 'good');
  } else {
    bookings.push(Object.assign({ id: newId('b'), fee: 0, reason: '' }, fields));
    showMessage(needsApproval ? 'Request sent. Status: Pending manager approval.' : 'Booking confirmed. Status: Approved.', 'good');
  }
  saveData();
  resetBookingForm();
  setFormMessage('', '');
  renderAll();
}

// Fill the form with an existing Pending booking so the member can change date/time (FR6)
function startEdit(id) {
  const b = bookings.find((x) => x.id === id);
  if (!b || b.status !== 'Pending') return;
  editingId = id;
  $('memberName').value = b.memberName;
  $('email').value = b.email;
  $('facility').value = b.facilityId;
  $('date').value = b.date;
  $('start').value = b.start;
  $('duration').value = String(b.duration);
  document.querySelector('input[name="bookingType"][value="' + b.type + '"]').checked = true;
  $('teamName').value = b.teamName;
  $('players').value = b.players || '';
  $('formTitle').textContent = 'Change booking date or time';
  $('submitBtn').textContent = 'Save changes';
  $('cancelEditBtn').hidden = false;
  refreshBookingForm();
  $('booking').scrollIntoView();
  $('date').focus();
}

/* ---------- 7. Actions: approve, reject, cancel (confirmation panel) ---------- */
function openPanel(action, title, text, items, needsReason, confirmLabel) {
  pendingAction = action;
  $('panelTitle').textContent = title;
  $('panelText').textContent = text;
  $('panelList').innerHTML = items.map((i) => '<li>' + escapeHtml(i) + '</li>').join('');
  $('reasonWrap').hidden = !needsReason;
  $('reasonInput').value = '';
  setError('reasonInput', '');
  $('panelConfirm').textContent = confirmLabel;
  $('actionPanel').hidden = false;
  $('actionPanel').focus();
}
function closePanel() { pendingAction = null; $('actionPanel').hidden = true; }

function describeBooking(b) {
  const f = getFacility(b.facilityId);
  return (f ? f.name : '') + ', ' + b.date + ', ' + b.start + ' to ' + hourLabel(hourOf(b.start) + b.duration);
}

function askCancel(id) {
  const b = bookings.find((x) => x.id === id);
  const info = calcCancellation(b);
  if (!info.allowed) { showMessage('This booking has already started and cannot be cancelled.', 'bad'); return; }
  const text = info.fee > 0
    ? 'The start is within 24 hours, so a 50% fee applies: ' + money(info.fee) + '.'
    : 'More than 24 hours before the start: free cancellation (fee 0.00 units).';
  openPanel({ type: 'cancel', id }, 'Cancel this booking?', text, [describeBooking(b)], false, 'Confirm cancellation');
}

function handleTableClick(event) {
  const button = event.target.closest('button[data-action]');
  if (!button) return;
  const id = button.dataset.id;
  const action = button.dataset.action;
  const b = bookings.find((x) => x.id === id);
  if (!b) return;
  if (action === 'edit' && currentRole === 'Member') startEdit(id);
  if (action === 'cancel' && currentRole === 'Member') askCancel(id);
  if (action === 'approve' && currentRole === 'Manager') {
    b.status = 'Approved';
    saveData(); renderAll();
    showMessage('Booking approved.', 'good');
  }
  if (action === 'reject' && currentRole === 'Manager') {
    openPanel({ type: 'reject', id }, 'Reject this booking?', 'Enter a reason. The member will see it.', [describeBooking(b)], true, 'Reject booking');
  }
}

function confirmPanel() {
  if (!pendingAction) return;
  const action = pendingAction;
  if (action.type === 'cancel') {
    const b = bookings.find((x) => x.id === action.id);
    const info = calcCancellation(b);
    if (!info.allowed) { closePanel(); showMessage('This booking has already started.', 'bad'); return; }
    b.status = 'Cancelled';
    b.fee = info.fee;
    showMessage('Booking cancelled. Fee: ' + money(info.fee) + '.', 'good');
  } else if (action.type === 'reject') {
    const reason = $('reasonInput').value.trim();
    if (!reason) { setError('reasonInput', 'Please enter a reason.'); $('reasonInput').focus(); return; }
    const b = bookings.find((x) => x.id === action.id);
    b.status = 'Rejected';
    b.reason = reason;
    showMessage('Booking rejected.', 'good');
  } else if (action.type === 'maintenance') {
    action.affectedIds.forEach((id) => {
      const b = bookings.find((x) => x.id === id);
      b.status = 'Cancelled';
      b.fee = 0;
      b.reason = 'Cancelled for maintenance: ' + action.block.reason;
    });
    blocks.push(action.block);
    $('maintenanceForm').reset();
    showMessage('Maintenance block added. ' + action.affectedIds.length + ' booking(s) cancelled.', 'good');
  }
  saveData();
  closePanel();
  refreshBookingForm();
  renderAll();
}

/* ---------- 8. Maintenance blocks (manager only) ---------- */
function handleMaintenanceSubmit(event) {
  event.preventDefault();
  if (currentRole !== 'Manager') return;
  const ids = ['mFacility', 'mDate', 'mStart', 'mEnd', 'mReason'];
  clearErrors(ids);
  let firstBad = null;
  const fail = (id, message) => { setError(id, message); if (!firstBad) firstBad = id; };
  ids.forEach((id) => { const m = fieldMessage(id); if (m) fail(id, m); });

  const block = { id: newId('m'), facilityId: $('mFacility').value, date: $('mDate').value,
                  start: $('mStart').value, end: $('mEnd').value, reason: $('mReason').value.trim() };
  if (!firstBad) {
    const s = hourOf(block.start), e = hourOf(block.end);
    if (e <= s) fail('mEnd', 'The end time must be after the start time.');
    else if (slotStart(block.date, e) <= new Date()) fail('mDate', 'This block is in the past.');
  }
  if (firstBad) { $(firstBad).focus(); return; }

  // FR16: warn if the block overlaps bookings
  const s = hourOf(block.start), e = hourOf(block.end);
  const affected = bookings.filter((b) => ACTIVE_STATUSES.includes(b.status) && b.facilityId === block.facilityId &&
    b.date === block.date && s < hourOf(b.start) + b.duration && hourOf(b.start) < e);
  if (affected.length > 0) {
    openPanel({ type: 'maintenance', block, affectedIds: affected.map((b) => b.id) },
      'This block overlaps existing bookings',
      'If you continue, these bookings are cancelled with no fee. Choose "Go back" to abort.',
      affected.map((b) => b.memberName + ': ' + describeBooking(b) + ' (' + b.status + ')'),
      false, 'Cancel bookings and add block');
    return;
  }
  blocks.push(block);
  saveData();
  $('maintenanceForm').reset();
  refreshBookingForm();
  renderAll();
  showMessage('Maintenance block added.', 'good');
}

/* ---------- 9. Start-up and event listeners ---------- */
function fillHourOptions(select, from, to) {
  let html = '';
  for (let h = from; h <= to; h++) html += '<option value="' + hourLabel(h) + '">' + hourLabel(h) + '</option>';
  select.innerHTML = html;
}

function fillFacilityControls() {
  const options = facilities.map((f) => '<option value="' + f.id + '">' + escapeHtml(f.name) + '</option>').join('');
  $('facility').innerHTML = options;
  $('mFacility').innerHTML = options;
  const types = Array.from(new Set(facilities.map((f) => f.type)));
  $('typeFilter').innerHTML = '<option value="">All types</option>' +
    types.map((t) => '<option>' + escapeHtml(t) + '</option>').join('');
}

function setDateLimits() {
  const today = todayString();
  const last = addDays(today, MAX_DAYS_AHEAD);
  ['date', 'mDate'].forEach((id) => { $(id).min = today; $(id).max = last; });
}

function init() {
  loadData();
  markCompletedBookings();
  saveData();
  fillFacilityControls();
  fillHourOptions($('start'), OPEN_HOUR, CLOSE_HOUR - 1);
  fillHourOptions($('mStart'), OPEN_HOUR, CLOSE_HOUR - 1);
  fillHourOptions($('mEnd'), OPEN_HOUR + 1, CLOSE_HOUR);
  setDateLimits();
  $('start').value = '10:00';

  // Role and identity
  $('roleSelect').addEventListener('change', () => {
    currentRole = $('roleSelect').value;
    closePanel();
    if (editingId) resetBookingForm();
    renderAll();
    showMessage('Role changed to ' + currentRole + '.', '');
  });
  $('currentEmail').addEventListener('input', () => {
    if (!editingId) $('email').value = $('currentEmail').value.trim();
    renderAll();
  });

  // Filters
  ['typeFilter', 'capacityFilter', 'availFilter'].forEach((id) => {
    $(id).addEventListener('input', () => { renderFacilities(); renderSummary(); });
  });
  $('clearFilters').addEventListener('click', () => {
    $('typeFilter').value = ''; $('capacityFilter').value = ''; $('availFilter').value = '';
    renderFacilities(); renderSummary();
  });
  ['statusFilter', 'dateFilter'].forEach((id) => $(id).addEventListener('input', renderBookings));
  $('clearBookingFilters').addEventListener('click', () => {
    $('statusFilter').value = ''; $('dateFilter').value = '';
    renderBookings();
  });

  // Booking form
  $('bookingForm').addEventListener('input', refreshBookingForm);
  $('bookingForm').addEventListener('change', refreshBookingForm);
  $('bookingForm').addEventListener('submit', handleBookingSubmit);
  $('cancelEditBtn').addEventListener('click', () => { resetBookingForm(); setFormMessage('Editing stopped.', ''); });
  $('suggestion').addEventListener('click', (event) => {
    const button = event.target.closest('#useSuggestion');
    if (!button) return;
    $('date').value = button.dataset.date;
    $('start').value = button.dataset.start;
    refreshBookingForm();
    $('start').focus();
  });

  // Facility cards and schedule slots (event delegation)
  $('facilityList').addEventListener('click', (event) => {
    const button = event.target.closest('button[data-facility]');
    if (!button) return;
    $('facility').value = button.dataset.facility;
    refreshBookingForm();
    $('booking').scrollIntoView();
    $('facility').focus();
  });
  $('scheduleList').addEventListener('click', (event) => {
    const button = event.target.closest('button[data-hour]');
    if (!button) return;
    $('start').value = hourLabel(Number(button.dataset.hour));
    refreshBookingForm();
    $('start').focus();
  });

  // Bookings table, panel, maintenance
  $('bookingBody').addEventListener('click', handleTableClick);
  $('panelConfirm').addEventListener('click', confirmPanel);
  $('panelBack').addEventListener('click', closePanel);
  $('maintenanceForm').addEventListener('submit', handleMaintenanceSubmit);
  $('blockList').addEventListener('click', (event) => {
    const button = event.target.closest('button[data-remove-block]');
    if (!button || currentRole !== 'Manager') return;
    blocks = blocks.filter((bl) => bl.id !== button.dataset.removeBlock);
    saveData(); refreshBookingForm(); renderAll();
    showMessage('Maintenance block removed.', 'good');
  });
  $('resetData').addEventListener('click', () => {
    buildSampleData();
    saveData();
    closePanel();
    resetBookingForm();
    renderAll();
    showMessage('Sample data restored.', 'good');
  });

  resetBookingForm();
  renderAll();
}

init();
