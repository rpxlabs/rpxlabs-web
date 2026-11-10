// RPXLABS Graduation Booking - Google Apps Script
// File ini untuk Google Apps Script yang menerima data dari form HTML

// KONFIGURASI - GANTI SESUAI KEBUTUHAN
const CONFIG = {
  // ID Google Sheets kamu (ambil dari URL sheets)
  SHEET_ID: '1SvnQuLb23ZEei6pXDRG-p7bqnP-EODq9srV3bbV6eig',
  
  // Nama sheet/tab (default: "Bookings")
  SHEET_NAME: 'Bookings',
  
  // WhatsApp Notification via CallMeBot API (disabled - pakai wa.me)
  WHATSAPP_ENABLED: false,
  WHATSAPP_PHONE: '+628****0398',
  CALLMEBOT_API_KEY: 'tidak_digunakan'
};

// Jam kerja wisuda: 05:00 - 17:00 (Other Jobs di luar jam ini tidak count slot)
const WISUDA_WORK_START = '05:00';
const WISUDA_WORK_END = '17:00';

// PIN untuk akses web kalender (ganti sesuai keinginan)
const CALENDAR_PIN = '2026';

/** Helper: cek apakah time range overlap dengan jam kerja wisuda */
function isOverlapWithWisudaHours(startTime, endTime) {
  const toMinutes = (time) => {
    const [h, m] = time.split(':').map(Number);
    return h * 60 + m;
  };
  
  const jobStart = toMinutes(startTime);
  const jobEnd = toMinutes(endTime);
  const workStart = toMinutes(WISUDA_WORK_START);
  const workEnd = toMinutes(WISUDA_WORK_END);
  
  // Overlap jika: job start < work end DAN job end > work start
  return jobStart < workEnd && jobEnd > workStart;
}

/**
 * Fungsi untuk handle POST request dari form HTML
 */
function doPost(e) {
  try {
    // Guard: request tanpa body (mis. tes manual dari editor) tidak boleh crash
    if (!e || !e.postData || !e.postData.contents) {
      return ContentService.createTextOutput(JSON.stringify({
        success: false,
        error: 'No request body received. Kirim POST dengan JSON.'
      })).setMimeType(ContentService.MimeType.JSON);
    }
    
    // Parse data dari form
    const data = JSON.parse(e.postData.contents);
    
    // Routing: form admin "Other Jobs" vs form wisuda
    if (data.formType === 'other') {
      const otherResult = saveOtherJob(data);
      return ContentService.createTextOutput(JSON.stringify(otherResult))
        .setMimeType(ContentService.MimeType.JSON);
    }
    
    // Simpan ke Google Sheets
    const result = saveToSheet(data);
    
    // Kirim notifikasi WhatsApp
    if (CONFIG.WHATSAPP_ENABLED && CONFIG.CALLMEBOT_API_KEY !== 'YOUR_CALLMEBOT_API_KEY_HERE') {
      sendWhatsAppNotification(data);
    }
    
    // Return dengan CORS headers
    const output = JSON.stringify({ success: true, message: 'Booking berhasil disimpan' });
    return HtmlService.createHtmlOutput(output)
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
      .addMetaTag('viewport', 'width=device-width, initial-scale=1')
      .setTitle('RPXLABS Booking API');
      
  } catch (error) {
    Logger.log('Error: ' + error.toString());
    const output = JSON.stringify({ success: false, error: error.toString() });
    return HtmlService.createHtmlOutput(output)
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  }
}

/**
 * Handle GET requests
 */
function doGet(e) {
  try {
    const params = e.parameter;
    
    // API: Get available slots for a date
    if (params.action === 'getSlots' && params.date) {
      const bookedSlots = getBookedSlotsForDate(params.date);
      const output = JSON.stringify({ 
        success: true, 
        date: params.date,
        bookedSlots: bookedSlots 
      });
      return ContentService.createTextOutput(output)
        .setMimeType(ContentService.MimeType.JSON);
    }
    
    // API: Get high-demand dates (>=2 bookings, next 30 days)
    if (params.action === 'getHighDemand') {
      const highDemand = getDailyCapacitySummary();
      const output = JSON.stringify({ 
        success: true, 
        highDemand: highDemand 
      });
      return ContentService.createTextOutput(output)
        .setMimeType(ContentService.MimeType.JSON);
    }
    
    // API: Setup tab "Other Jobs" (jalankan sekali)
    if (params.action === 'setupOtherJobs') {
      const result = setupOtherJobsSheet();
      return ContentService.createTextOutput(JSON.stringify(result))
        .setMimeType(ContentService.MimeType.JSON);
    }
    
    // API: Format tab "Other Jobs" (beautify sheet)
    if (params.action === 'formatOtherJobs') {
      const result = formatOtherJobsSheet();
      return ContentService.createTextOutput(JSON.stringify(result))
        .setMimeType(ContentService.MimeType.JSON);
    }
    
    // API: Album foto (running harian + event spesial) dari sheet
    if (params.action === 'getAlbums') {
      const type = (params.type || 'running').toLowerCase();
      const albums = getAlbumsFromSheet(type);
      return ContentService.createTextOutput(JSON.stringify({
        success: true, type: type, albums: albums
      })).setMimeType(ContentService.MimeType.JSON);
    }

    // API: Setup tab album (jalankan sekali)
    if (params.action === 'setupAlbums') {
      return ContentService.createTextOutput(JSON.stringify(setupAlbumsSheets()))
        .setMimeType(ContentService.MimeType.JSON);
    }

    // API: Gabungan jadwal (wisuda + other jobs) untuk rentang tanggal
    if (params.action === 'getSchedule') {
      const events = getAllEvents(params.from || '', params.to || '');
      const output = JSON.stringify({ success: true, events: events });
      return ContentService.createTextOutput(output)
        .setMimeType(ContentService.MimeType.JSON);
    }
    
    // API: Kalender bulanan (grouped by date) + PIN gate
    if (params.action === 'getCalendarMonth') {
      const pin = String(params.pin || '').trim();
      if (CALENDAR_PIN && pin !== CALENDAR_PIN) {
        return ContentService.createTextOutput(JSON.stringify({
          success: false,
          error: 'PIN_SALAH'
        })).setMimeType(ContentService.MimeType.JSON);
      }
      const result = getCalendarMonth(params.year, params.month);
      return ContentService.createTextOutput(JSON.stringify(result))
        .setMimeType(ContentService.MimeType.JSON);
    }

    // API: Cek tabrakan jadwal
    if (params.action === 'checkConflict' && params.date && params.start && params.end) {
      const conflicts = checkConflicts(params.date, params.start, params.end);
      const output = JSON.stringify({
        success: true,
        date: params.date,
        start: params.start,
        end: params.end,
        hasConflict: conflicts.length > 0,
        conflicts: conflicts
      });
      return ContentService.createTextOutput(output)
        .setMimeType(ContentService.MimeType.JSON);
    }
    
    // Default: API status
    const output = JSON.stringify({ 
      status: 'OK', 
      message: 'RPXLABS Booking API ready', 
      sheet: CONFIG.SHEET_ID 
    });
    return ContentService.createTextOutput(output)
      .setMimeType(ContentService.MimeType.JSON);
      
  } catch (error) {
    Logger.log('doGet Error: ' + error.toString());
    const output = JSON.stringify({ success: false, error: error.toString() });
    return ContentService.createTextOutput(output)
      .setMimeType(ContentService.MimeType.JSON);
  }
}

/**
 * Get booked time slots for a specific date dengan durasi
 * Returns array of {startTime, endTime, paket}
 */
function getBookedSlotsForDate(targetDate) {
  try {
    const ss = SpreadsheetApp.openById(CONFIG.SHEET_ID);
    const bookedSlots = [];
    
    /* ---- Wisuda bookings ---- */
    const sheetWisuda = ss.getSheetByName(CONFIG.SHEET_NAME);
    if (sheetWisuda && sheetWisuda.getLastRow() >= 2) {
      const lastRow = sheetWisuda.getLastRow();
      const dateRange = sheetWisuda.getRange(2, 7, lastRow - 1, 3).getValues(); // G=Tanggal, H=Jam, I=Paket
      
      dateRange.forEach(row => {
        const bookingDateStr = row[0]; // Tanggal Sesi
        const bookingTime = row[1];     // Jam
        const paket = row[2];           // Paket
        
        // Convert booking date to YYYY-MM-DD format
        let dateStr = '';
        if (bookingDateStr instanceof Date) {
          dateStr = Utilities.formatDate(bookingDateStr, Session.getScriptTimeZone(), 'yyyy-MM-dd');
        } else if (typeof bookingDateStr === 'string') {
          dateStr = bookingDateStr;
        }
        
        // Match target date
        if (dateStr === targetDate && bookingTime) {
          // Extract HH:MM from time
          let timeStr = '';
          if (bookingTime instanceof Date) {
            timeStr = Utilities.formatDate(bookingTime, Session.getScriptTimeZone(), 'HH:mm');
          } else if (typeof bookingTime === 'string') {
            timeStr = bookingTime.substring(0, 5); // \"06:00:00\" -> \"06:00\"
          }
          
          if (timeStr && paket) {
            // Get duration in minutes based on paket
            let durationMinutes = 60; // default Silver
            if (paket.includes('Gold')) durationMinutes = 90;
            if (paket.includes('Platinum')) durationMinutes = 120;
            if (paket.includes('Bestie')) durationMinutes = 90;
            
            // Calculate end time
            const [hours, mins] = timeStr.split(':').map(Number);
            const startDate = new Date(2000, 0, 1, hours, mins);
            const endDate = new Date(startDate.getTime() + durationMinutes * 60000);
            const endTimeStr = Utilities.formatDate(endDate, Session.getScriptTimeZone(), 'HH:mm');
            
            bookedSlots.push({
              startTime: timeStr,
              endTime: endTimeStr,
              paket: paket,
              source: 'wisuda'
            });
          }
        }
      });
    }
    
    /* ---- Other Jobs bookings ---- */
    const sheetOther = ss.getSheetByName(OTHER_SHEET_NAME);
    if (sheetOther && sheetOther.getLastRow() >= 2) {
      const lastRow = sheetOther.getLastRow();
      const otherRange = sheetOther.getRange(2, 6, lastRow - 1, 3).getValues(); // F=Tanggal, G=Jam Start, H=Jam End
      
      otherRange.forEach(row => {
        const tanggal = row[0];
        const jamStart = row[1];
        const jamEnd = row[2];
        
        // Convert tanggal ke YYYY-MM-DD format
        let dateStr = '';
        if (tanggal instanceof Date) {
          dateStr = Utilities.formatDate(tanggal, Session.getScriptTimeZone(), 'yyyy-MM-dd');
        } else if (typeof tanggal === 'string') {
          dateStr = tanggal.trim();
        }
        
        // Match target date
        if (dateStr === targetDate && jamStart && jamEnd) {
          // Format jam start & end as HH:MM
          let startTime = '';
          let endTime = '';
          
          if (jamStart instanceof Date) {
            startTime = Utilities.formatDate(jamStart, Session.getScriptTimeZone(), 'HH:mm');
          } else if (typeof jamStart === 'string') {
            startTime = jamStart.substring(0, 5);
          }
          
          if (jamEnd instanceof Date) {
            endTime = Utilities.formatDate(jamEnd, Session.getScriptTimeZone(), 'HH:mm');
          } else if (typeof jamEnd === 'string') {
            endTime = jamEnd.substring(0, 5);
          }
          
          if (startTime && endTime) {
            // Include SEMUA Other Jobs (tidak filter jam) untuk conflict detection
            bookedSlots.push({
              startTime: startTime,
              endTime: endTime,
              paket: 'Other Job',
              source: 'other'
            });
          }
        }
      });
    }
    
    // Sort by start time ascending
    bookedSlots.sort((a, b) => {
      const aTime = a.startTime.replace(':', '');
      const bTime = b.startTime.replace(':', '');
      return parseInt(aTime) - parseInt(bTime);
    });
    
    return bookedSlots;
    
  } catch (error) {
    Logger.log('getBookedSlotsForDate Error: ' + error.toString());
    return [];
  }
}

/**
 * Simpan data booking ke Google Sheets
 */
function saveToSheet(data) {
  const ss = SpreadsheetApp.openById(CONFIG.SHEET_ID);
  let sheet = ss.getSheetByName(CONFIG.SHEET_NAME);
  
  // Buat sheet baru jika belum ada
  if (!sheet) {
    sheet = ss.insertSheet(CONFIG.SHEET_NAME);
  }
  
  // FORCE CLEAR ROW 1 (hapus header lama) sebelum tulis header baru
  if (sheet.getLastRow() === 0 || sheet.getRange(1, 1).getValue() === '') {
    // Sheet kosong - tulis header langsung
  } else {
    // Cek apakah row 1 adalah header
    const firstCell = sheet.getRange(1, 1).getValue();
    if (firstCell === 'Timestamp' || firstCell === '') {
      // Clear row 1 dulu
      sheet.deleteRow(1);
      sheet.insertRowBefore(1);
    }
  }
  
  // Header kolom (19 kolom TOTAL dengan Nominal DP + Sisa Pembayaran!)
  const headers = [
    'Timestamp',
    'Nama',
    'WhatsApp',
    'Instagram',
    'Universitas',
    'Lokasi',
    'Tanggal Sesi',
    'Jam',
    'Paket',
    'Jumlah Orang',
    'Cinematic Video',
    'Extra Edit',
    'Extra Person',
    'Extra Graduate',
    'Total Harga',
    'Nominal DP',
    'Sisa Pembayaran',
    'Catatan',
    'Status'
  ];
  
  // ⚠️ PENTING: bersihkan validasi data di ROW 1 (header) dulu,
  // supaya header tidak ditolak oleh aturan dropdown Status lama
  sheet.getRange(1, 1, 1, sheet.getMaxColumns()).clearDataValidations();
  
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  
  // Format header - MONOKROM GRAY
  sheet.getRange(1, 1, 1, headers.length)
    .setFontWeight('bold')
    .setBackground('#757575')
    .setFontColor('#ffffff');
  
  // Freeze header row
  sheet.setFrozenRows(1);
  
  // Auto-resize columns
  for (let i = 1; i <= headers.length; i++) {
    sheet.autoResizeColumn(i);
  }
  
  // Format timestamp
  const timestamp = new Date(data.timestamp);
  const formattedTimestamp = Utilities.formatDate(timestamp, 'Asia/Jakarta', 'yyyy-MM-dd HH:mm:ss');
  
  // Data row
  const row = [
    formattedTimestamp,
    data.nama || '',
    data.whatsapp || '',
    data.instagram || '',
    data.universitas || '',
    data.lokasi || '',
    data.tanggal || '',
    data.jam || '',
    data.paket || '',
    data.jumlahOrang || '',
    data.cinematicVideo || 'Tidak',
    data.extraEdit || 0,
    data.extraPerson || 0,
    data.extraGraduate || 0,
    data.totalHarga || '',
    data.nominalDP || 0,
    data.sisaPembayaran || 0,
    data.catatan || '',
    'Pending' // Status default
  ];
  
  // Append row
  sheet.appendRow(row);
  
  const lastRow = sheet.getLastRow();
  const lastCol = sheet.getLastColumn();
  const rowRange = sheet.getRange(lastRow, 1, 1, lastCol);
  
  // 🎨 AUTO-FORMAT ROW BARU - MONOKROM GRAY
  
  // 1. Zebra stripes untuk row baru (subtle monokrom)
  if (lastRow % 2 === 0) {
    rowRange.setBackground('#f9f9f9');  // Very light gray
  } else {
    rowRange.setBackground('#ffffff');  // White
  }
  
  // 2. Font styling - CENTER ALIGN
  rowRange
    .setFontSize(10)
    .setFontColor('#000000')
    .setVerticalAlignment('middle')
    .setHorizontalAlignment('center');
  
  // 3. Border - medium gray
  rowRange.setBorder(true, true, true, true, true, true, '#bdbdbd', SpreadsheetApp.BorderStyle.SOLID);
  
  // 4. Status column (col 19) formatting - MONOKROM + DROPDOWN
  const statusCell = sheet.getRange(lastRow, 19);
  const status = statusCell.getValue();
  
  // Status cell formatting - MONOKROM WHITE ONLY (no background color)
  statusCell
    .setBackground('#ffffff')
    .setFontColor('#000000')
    .setFontWeight('bold')
    .setHorizontalAlignment('center')
    .setValue('Pending');
  
  // Add dropdown validation for Status column (new rows only)
  const statusValidation = SpreadsheetApp.newDataValidation()
    .requireValueInList(['Pending', 'Process', 'Done'], true)
    .setAllowInvalid(false)
    .build();
  statusCell.setDataValidation(statusValidation);
  
  // 5. Highlight urgent bookings (< 7 hari) - MONOKROM
  const tanggalCol = 8;
  const dateCell = sheet.getRange(lastRow, tanggalCol);
  const sessionDate = new Date(data.tanggal);
  const today = new Date();
  const urgentDate = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000);
  
  if (sessionDate >= today && sessionDate <= urgentDate) {
    // Highlight row dengan border kiri tebal gray
    rowRange.setBorder(null, true, null, null, null, null, '#757575', SpreadsheetApp.BorderStyle.SOLID_THICK);
    
    // Mark tanggal cell - gray
    dateCell
      .setBackground('#eeeeee')
      .setFontColor('#212121')
      .setFontWeight('bold')
      .setHorizontalAlignment('center');
  }
  
  // 6. Number formatting
  const totalCol = 16;
  sheet.getRange(lastRow, totalCol).setNumberFormat('"Rp "#,##0');
  sheet.getRange(lastRow, 1).setNumberFormat('dd/mm/yyyy hh:mm:ss');
  
  return { success: true, row: lastRow };
}

/**
 * Kirim notifikasi WhatsApp via CallMeBot API
 */
function sendWhatsAppNotification(data) {
  try {
    // Format pesan
    let message = `🔔 *BOOKING BARU GRADUATION*\n\n`;
    message += `👤 ${data.nama}\n`;
    message += `📱 ${data.whatsapp}\n`;
    message += `🎓 ${data.universitas}\n`;
    message += `📅 ${data.tanggal} - ${data.jam}\n`;
    message += `📦 ${data.paket}\n`;
    message += `💰 ${data.totalHarga}\n`;
    if (data.catatan) {
      message += `\n📝 ${data.catatan}`;
    }
    
    // Encode URL
    const encodedMessage = encodeURIComponent(message);
    const encodedPhone = encodeURIComponent(CONFIG.WHATSAPP_PHONE);
    
    // CallMeBot API endpoint
    const url = `https://api.callmebot.com/whatsapp.php?phone=${encodedPhone}&text=${encodedMessage}&apikey=${CONFIG.CALLMEBOT_API_KEY}`;
    
    // Send request
    const response = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
    Logger.log('WhatsApp notification sent: ' + response.getContentText());
    
    return true;
  } catch (error) {
    Logger.log('WhatsApp notification error: ' + error.toString());
    return false;
  }
}

/**
 * Fungsi test untuk coba simpan data dummy
 */
function testSaveData() {
  const testData = {
    timestamp: new Date().toISOString(),
    nama: 'Test User',
    whatsapp: '08123456789',
    instagram: '@testuser',
    universitas: 'Universitas Test',
    lokasi: 'Kampus Utama',
    tanggal: '2026-11-15',
    jam: '09:00',
    paket: 'Gold - Rp 600.000',
    jumlahOrang: '5',
    cinematicVideo: 'Ya',
    extraEdit: 5,
    extraPerson: 1,
    extraGraduate: 0,
    totalHarga: 'Rp 1.005.000',
    catatan: 'Test booking'
  };
  
  const result = saveToSheet(testData);
  Logger.log('Test result: ' + JSON.stringify(result));
}

/**
 * Fungsi untuk update status booking
 */
function updateBookingStatus(row, status) {
  const ss = SpreadsheetApp.openById(CONFIG.SHEET_ID);
  const sheet = ss.getSheetByName(CONFIG.SHEET_NAME);
  
  // Status column (kolom terakhir)
  const statusColumn = 19;
  sheet.getRange(row, statusColumn).setValue(status);
  
  // Color code berdasarkan status - MONOKROM GRAY
  const colors = {
    'Pending': '#f5f5f5',
    'Confirmed': '#e0e0e0',
    'Completed': '#d0d0d0',
    'Cancelled': '#bdbdbd'
  };
  
  if (colors[status]) {
    sheet.getRange(row, 1, 1, statusColumn)
      .setBackground(colors[status])
      .setHorizontalAlignment('center');
  }
}

/**
 * 🎨 FORMAT SHEET OTOMATIS - Run sekali untuk beautify sheet
 * Jalankan function ini di Apps Script untuk format sheet jadi bagus
 */
function formatSheetBeautiful() {
  const ss = SpreadsheetApp.openById(CONFIG.SHEET_ID);
  let sheet = ss.getSheetByName(CONFIG.SHEET_NAME);
  
  if (!sheet) {
    Logger.log('Sheet "' + CONFIG.SHEET_NAME + '" tidak ditemukan!');
    return;
  }
  
  const lastRow = sheet.getLastRow();
  const lastCol = sheet.getLastColumn();
  
  if (lastRow < 1) {
    Logger.log('Sheet kosong!');
    return;
  }
  
  // 1. CLEAR ALL FORMATTING dulu
  sheet.clearConditionalFormatRules();
  sheet.clearFormats();
  
  // Remove existing banding
  const existingBandings = sheet.getBandings();
  for (let i = 0; i < existingBandings.length; i++) {
    existingBandings[i].remove();
  }
  
  // 2. CONVERT TO TABLE RANGE dengan filter
  const dataRange = sheet.getRange(1, 1, lastRow, lastCol);
  
  // Remove existing filter
  let filter = sheet.getFilter();
  if (filter) {
    filter.remove();
  }
  
  // Create filter baru
  dataRange.createFilter();
  
  // 2. HEADER STYLING (Row 1) - MONOKROM GRAY
  const headerRange = sheet.getRange(1, 1, 1, lastCol);
  headerRange
    .setBackground('#757575')           // Dark gray
    .setFontColor('#ffffff')            // White text
    .setFontWeight('bold')
    .setFontSize(10)
    .setHorizontalAlignment('center')   // CENTER ALIGN
    .setVerticalAlignment('middle')
    .setWrap(false);
  
  // Header height
  sheet.setRowHeight(1, 30);
  
  // 3. FREEZE HEADER & First column
  sheet.setFrozenRows(1);
  sheet.setFrozenColumns(0);  // No frozen columns (optional)
  
  // 4. AUTO-RESIZE COLUMNS dengan padding
  for (let i = 1; i <= lastCol; i++) {
    sheet.autoResizeColumn(i);
    
    // Tambah padding 30px dari auto-size
    const currentWidth = sheet.getColumnWidth(i);
    const newWidth = currentWidth + 30;
    
    // Set min & max width
    if (newWidth > 300) {
      sheet.setColumnWidth(i, 300);
    } else if (newWidth < 120) {
      sheet.setColumnWidth(i, 120);
    } else {
      sheet.setColumnWidth(i, newWidth);
    }
  }
  
  // Set kolom khusus lebih lebar
  if (lastCol >= 2) sheet.setColumnWidth(2, 150);  // Nama
  if (lastCol >= 3) sheet.setColumnWidth(3, 130);  // WhatsApp
  if (lastCol >= 6) sheet.setColumnWidth(6, 180);  // Universitas
  if (lastCol >= 7) sheet.setColumnWidth(7, 160);  // Lokasi
  if (lastCol >= 10) sheet.setColumnWidth(10, 180); // Paket
  if (lastCol >= 16) sheet.setColumnWidth(16, 140); // Nominal DP
  if (lastCol >= 17) sheet.setColumnWidth(17, 140); // Sisa Pembayaran
  if (lastCol >= 18) sheet.setColumnWidth(18, 140); // Catatan
  if (lastCol >= 19) sheet.setColumnWidth(19, 200); // Status
  
  // 5. DATA ROWS STYLING (clean white background) - CENTER ALIGNED
  if (lastRow > 1) {
    const dataRows = sheet.getRange(2, 1, lastRow - 1, lastCol);
    
    // Clean white background untuk semua data - CENTER ALL TEXT
    dataRows
      .setBackground('#ffffff')
      .setFontSize(10)
      .setFontColor('#000000')
      .setVerticalAlignment('middle')
      .setHorizontalAlignment('center')  // CENTER ALIGN SEMUA
      .setWrap(true);
    
    // Row height LEBIH LEBAR
    for (let row = 2; row <= lastRow; row++) {
      sheet.setRowHeight(row, 35);  // Increased dari 21 ke 35
    }
  }
  
  // 6. BORDER GRID (table style monokrom)
  if (lastRow > 0) {
    dataRange.setBorder(
      true, true, true, true, true, true,
      '#bdbdbd',  // Medium gray border
      SpreadsheetApp.BorderStyle.SOLID
    );
    
    // Thicker border untuk header bottom (monokrom)
    headerRange.setBorder(
      true, true, true, true, false, false,
      '#757575',  // Dark gray header border
      SpreadsheetApp.BorderStyle.SOLID_MEDIUM
    );
  }
  
  // 7. STATUS COLUMN COLOR CODING (Column 19) - MONOKROM GRAY
  const statusCol = 19;
  if (lastRow > 1 && lastCol >= statusCol) {
    for (let row = 2; row <= lastRow; row++) {
      const statusCell = sheet.getRange(row, statusCol);
      const status = statusCell.getValue();
      
      const statusStyles = {
        'Pending': { bg: '#f5f5f5', text: '#424242' },       // Light gray
        'Confirmed': { bg: '#e0e0e0', text: '#212121' },     // Medium gray
        'Completed': { bg: '#d0d0d0', text: '#212121' },     // Darker gray
        'Cancelled': { bg: '#bdbdbd', text: '#000000' }      // Dark gray
      };
      
      if (statusStyles[status]) {
        statusCell
          .setBackground(statusStyles[status].bg)
          .setFontColor(statusStyles[status].text)
          .setFontWeight('bold')
          .setHorizontalAlignment('center');
      }
      
      // Add dropdown validation untuk Status cell
      const statusValidation = SpreadsheetApp.newDataValidation()
        .requireValueInList(['Pending', 'Process', 'Done'], true)
        .setAllowInvalid(false)
        .build();
      statusCell.setDataValidation(statusValidation);
    }
  }
  
  // 8. CONDITIONAL HIGHLIGHT untuk urgent dates (< 7 hari)
  const tanggalCol = 8;
  if (lastRow > 1 && lastCol >= tanggalCol) {
    const today = new Date();
    const urgentDate = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000);
    
    for (let row = 2; row <= lastRow; row++) {
      const dateCell = sheet.getRange(row, tanggalCol);
      const sessionDate = new Date(dateCell.getValue());
      
      const statusCell = sheet.getRange(row, statusCol);
      const status = statusCell.getValue();
      
      // Highlight jika urgent DAN belum completed/cancelled
      if (sessionDate >= today && sessionDate <= urgentDate && 
          status !== 'Completed' && status !== 'Cancelled') {
        dateCell
          .setBackground('#eeeeee')  // Very light gray
          .setFontWeight('bold')
          .setFontColor('#212121')
          .setHorizontalAlignment('center');
      }
    }
  }
  
  // 9. NUMBER FORMATTING
  // Total Harga column (16)
  const totalCol = 16;
  if (lastRow > 1 && lastCol >= totalCol) {
    sheet.getRange(2, totalCol, lastRow - 1, 1)
      .setNumberFormat('"Rp "#,##0')
      .setHorizontalAlignment('center');
  }
  
  // Timestamp column (1)
  if (lastRow > 1) {
    sheet.getRange(2, 1, lastRow - 1, 1)
      .setNumberFormat('dd/mm/yyyy hh:mm')
      .setHorizontalAlignment('center');
  }
  
  // Numeric columns center aligned
  const numericCols = [11, 13, 14, 15];
  numericCols.forEach(col => {
    if (lastRow > 1 && lastCol >= col) {
      sheet.getRange(2, col, lastRow - 1, 1)
        .setHorizontalAlignment('center');
    }
  });
  
  // 10. ALTERNATING ROW COLORS (subtle zebra)
  if (lastRow > 1) {
    sheet.clearConditionalFormatRules();
    
    // Hapus banding lama jika ada
    const existingBandings = sheet.getBandings();
    for (let i = 0; i < existingBandings.length; i++) {
      existingBandings[i].remove();
    }
    
    // Pasang banding monokrom baru
    try {
      const bandingRange = sheet.getRange(2, 1, lastRow - 1, lastCol);
      const banding = bandingRange.applyRowBanding(SpreadsheetApp.BandingTheme.LIGHT_GREY);
      banding
        .setFirstRowColor('#ffffff')
        .setSecondRowColor('#f9f9f9')
        .setHeaderRowColor('#757575')
        .setFooterRowColor(null);
    } catch (e) {
      Logger.log('Banding skip: ' + e.message);
    }
  }
  
  Logger.log('✅ Sheet "' + CONFIG.SHEET_NAME + '" berhasil diformat dengan table style!');
  Logger.log('Total rows: ' + lastRow + ', Total columns: ' + lastCol);
  
  return {
    success: true,
    message: 'Sheet formatted as modern table',
    rows: lastRow,
    columns: lastCol
  };
}

/**
 * Get daily capacity summary for next 30 days (max 4 bookings/day)
 * Returns array of {date, universitas, booked, available, status}
 * Only includes dates with >=2 bookings (high-demand)
 */
function getDailyCapacitySummary() {
  try {
    const ss = SpreadsheetApp.openById(CONFIG.SHEET_ID);
    const today = new Date();
    const futureLimit = new Date(today.getTime() + 30 * 24 * 60 * 60 * 1000);
    
    // Summary per date: { dateStr, bookings: {univ: count}, totalWisuda, totalOther, totalAll }
    const summary = {};
    
    /* ---- Wisuda (Bookings) ---- */
    const sheetWisuda = ss.getSheetByName(CONFIG.SHEET_NAME);
    if (sheetWisuda && sheetWisuda.getLastRow() >= 2) {
      const lastRow = sheetWisuda.getLastRow();
      const data = sheetWisuda.getRange(2, 5, lastRow - 1, 3).getValues(); // E=Univ, G=Tanggal
      
      data.forEach(row => {
        const universitas = row[0];
        const tanggal = row[2];
        
        if (!tanggal || !universitas) return;
        
        let dateStr = '';
        if (tanggal instanceof Date) {
          dateStr = Utilities.formatDate(tanggal, Session.getScriptTimeZone(), 'yyyy-MM-dd');
        } else if (typeof tanggal === 'string') {
          dateStr = tanggal.trim();
        } else {
          return;
        }
        
        const bookingDate = new Date(tanggal);
        if (bookingDate < today || bookingDate > futureLimit) return;
        
        const key = dateStr;
        if (!summary[key]) {
          summary[key] = {
            date: dateStr,
            bookings: {},
            totalWisuda: 0,
            totalOther: 0,
            totalAll: 0
          };
        }
        
        if (!summary[key].bookings[universitas]) {
          summary[key].bookings[universitas] = 0;
        }
        summary[key].bookings[universitas] += 1;
        summary[key].totalWisuda += 1;
        summary[key].totalAll += 1;
      });
    }
    
    /* ---- Other Jobs (hanya yang overlap jam kerja wisuda 05:00-17:00) ---- */
    const sheetOther = ss.getSheetByName(OTHER_SHEET_NAME);
    if (sheetOther && sheetOther.getLastRow() >= 2) {
      const lastRow = sheetOther.getLastRow();
      const data = sheetOther.getRange(2, 6, lastRow - 1, 3).getValues(); // F=Tanggal, G=Jam Start, H=Jam End
      
      data.forEach(row => {
        const tanggal = row[0];
        const jamStart = row[1];
        const jamEnd = row[2];
        if (!tanggal) return;
        
        let dateStr = '';
        if (tanggal instanceof Date) {
          dateStr = Utilities.formatDate(tanggal, Session.getScriptTimeZone(), 'yyyy-MM-dd');
        } else if (typeof tanggal === 'string') {
          dateStr = tanggal.trim();
        } else {
          return;
        }
        
        const bookingDate = new Date(tanggal);
        if (bookingDate < today || bookingDate > futureLimit) return;
        
        // Parse jam untuk cek overlap
        let startTime = '', endTime = '';
        if (jamStart instanceof Date) {
          startTime = Utilities.formatDate(jamStart, Session.getScriptTimeZone(), 'HH:mm');
        } else if (typeof jamStart === 'string') {
          startTime = jamStart.substring(0, 5);
        }
        if (jamEnd instanceof Date) {
          endTime = Utilities.formatDate(jamEnd, Session.getScriptTimeZone(), 'HH:mm');
        } else if (typeof jamEnd === 'string') {
          endTime = jamEnd.substring(0, 5);
        }
        
        // Skip jika tidak overlap dengan jam kerja wisuda (05:00-17:00)
        if (startTime && endTime && !isOverlapWithWisudaHours(startTime, endTime)) {
          return;
        }
        
        const key = dateStr;
        if (!summary[key]) {
          summary[key] = {
            date: dateStr,
            bookings: {},
            totalWisuda: 0,
            totalOther: 0,
            totalAll: 0
          };
        }
        
        summary[key].totalOther += 1;
        summary[key].totalAll += 1;
      });
    }
    
    const result = [];
    const MAX_PER_DAY = 4;
    
    for (const [date, info] of Object.entries(summary)) {
      // Skip jika total < 2 (tidak high‑demand)
      if (info.totalAll < 2) continue;
      
      let dominantUniv = '';
      let maxCount = 0;
      for (const [univ, count] of Object.entries(info.bookings)) {
        if (count > maxCount) {
          maxCount = count;
          dominantUniv = univ;
        }
      }
      
      // Label universitas hanya jika ada booking wisuda; kalau hanya other jobs → "Non‑Wisuda"
      const univLabel = dominantUniv || (info.totalOther > 0 ? 'Non‑Wisuda' : '—');
      
      result.push({
        date: info.date,
        universitas: univLabel,
        booked: info.totalAll,
        available: MAX_PER_DAY - info.totalAll,
        status: info.totalAll >= MAX_PER_DAY ? 'FULL' : (info.totalAll >= 3 ? 'HIGH' : 'MEDIUM')
      });
    }
    
    result.sort((a, b) => new Date(a.date) - new Date(b.date));
    return result.slice(0, 5);
    
  } catch (error) {
    Logger.log('getDailyCapacitySummary Error: ' + error.toString());
    return [];
  }
}

/* ============================================================
   ADMIN SCHEDULE — "Other Jobs" (non-wisuda: sport / event / doc)
   Single source of truth: sheet yang sama dengan web wisuda.
   ============================================================ */

const OTHER_SHEET_NAME = 'Other Jobs';

const OTHER_HEADERS = [
  'Timestamp',   // A
  'Jenis',       // B  Sport / Event / Documentation
  'Sub-Type',    // C  Padel, Lari, Akad, Birthday, Product, ...
  'Detail',      // D  nama klien / judul job
  'Lokasi',      // E
  'Tanggal',     // F  yyyy-mm-dd
  'Jam Start',   // G  HH:mm
  'Jam End',     // H  HH:mm
  'Durasi',      // I  auto (jam)
  'DP',          // J
  'Harga Total', // K
  'Status',      // L  BOOKED / DONE / CANCELLED
  'Catatan'      // M
];

/** Ambil / buat sheet "Other Jobs" + header + format */
function ensureOtherJobsSheet() {
  const ss = SpreadsheetApp.openById(CONFIG.SHEET_ID);
  let sheet = ss.getSheetByName(OTHER_SHEET_NAME);

  if (!sheet) {
    sheet = ss.insertSheet(OTHER_SHEET_NAME);
  }

  const current = sheet.getLastRow() > 0
    ? sheet.getRange(1, 1, 1, OTHER_HEADERS.length).getValues()[0]
    : [];

  const needsHeader = sheet.getLastRow() === 0 || String(current[0] || '').trim() !== 'Timestamp';

  if (needsHeader) {
    sheet.getRange(1, 1, 1, OTHER_HEADERS.length).setValues([OTHER_HEADERS]);
    sheet.getRange(1, 1, 1, OTHER_HEADERS.length)
      .setFontWeight('bold')
      .setBackground('#1f1f1f')
      .setFontColor('#f0f0f0')
      .setVerticalAlignment('middle');
    sheet.setFrozenRows(1);
    sheet.setRowHeight(1, 34);
    sheet.getRange(1, 1, 1, OTHER_HEADERS.length)
      .setBorder(null, null, true, null, null, null, '#ffffff', SpreadsheetApp.BorderStyle.SOLID);

    const widths = [150, 110, 130, 210, 170, 110, 100, 100, 90, 100, 120, 110, 220];
    widths.forEach((w, i) => sheet.setColumnWidth(i + 1, w));

    // Format tanggal & jam
    sheet.getRange('F2:F1000').setNumberFormat('yyyy-mm-dd');
    sheet.getRange('G2:H1000').setNumberFormat('@');
    sheet.getRange('I2:I1000').setNumberFormat('0.##" jam"');

    // Data validation Status
    const statusRule = SpreadsheetApp.newDataValidation()
      .requireValueInList(['BOOKED', 'DONE', 'CANCELLED'], true)
      .build();
    sheet.getRange('L2:L1000').setDataValidation(statusRule);
  }

  return sheet;
}

/** Setup manual dari editor Apps Script (jalankan sekali) */
function setupOtherJobsSheet() {
  const sheet = ensureOtherJobsSheet();
  Logger.log('Other Jobs sheet siap: ' + sheet.getName());
  return { success: true, sheet: sheet.getName(), headers: OTHER_HEADERS };
}

/** Format sheet "Other Jobs" — match style Bookings (monokrom clean) */
function formatOtherJobsSheet() {
  const ss = SpreadsheetApp.openById(CONFIG.SHEET_ID);
  let sheet = ss.getSheetByName(OTHER_SHEET_NAME);
  
  if (!sheet) {
    Logger.log('Sheet "' + OTHER_SHEET_NAME + '" belum ada. Jalankan setupOtherJobsSheet() dulu.');
    return { success: false, error: 'Sheet not found' };
  }
  
  const lastRow = sheet.getLastRow();
  const lastCol = OTHER_HEADERS.length;
  
  if (lastRow < 1) {
    Logger.log('Sheet kosong!');
    return { success: false, error: 'Sheet empty' };
  }
  
  // 1. Clear formatting + banding lama
  sheet.clearConditionalFormatRules();
  const existingBandings = sheet.getBandings();
  existingBandings.forEach(b => b.remove());
  
  // 2. Header styling — dark monokrom
  const headerRange = sheet.getRange(1, 1, 1, lastCol);
  headerRange
    .setBackground('#757575')
    .setFontColor('#ffffff')
    .setFontWeight('bold')
    .setFontSize(10)
    .setHorizontalAlignment('center')
    .setVerticalAlignment('middle')
    .setWrap(false);
  
  sheet.setRowHeight(1, 34);
  sheet.setFrozenRows(1);
  
  // 3. Column widths
  const widths = [150, 110, 130, 210, 170, 110, 100, 100, 90, 100, 120, 110, 220];
  widths.forEach((w, i) => sheet.setColumnWidth(i + 1, w));
  
  // 4. Data rows styling
  if (lastRow > 1) {
    const dataRows = sheet.getRange(2, 1, lastRow - 1, lastCol);
    dataRows
      .setBackground('#ffffff')
      .setFontSize(10)
      .setFontColor('#000000')
      .setVerticalAlignment('middle')
      .setHorizontalAlignment('center')
      .setWrap(true);
    
    for (let row = 2; row <= lastRow; row++) {
      sheet.setRowHeight(row, 35);
    }
  }
  
  // 5. Border grid
  const dataRange = sheet.getRange(1, 1, Math.max(lastRow, 1), lastCol);
  dataRange.setBorder(
    true, true, true, true, true, true,
    '#bdbdbd',
    SpreadsheetApp.BorderStyle.SOLID
  );
  
  headerRange.setBorder(
    true, true, true, true, false, false,
    '#757575',
    SpreadsheetApp.BorderStyle.SOLID_MEDIUM
  );
  
  // 6. Status column color coding (col 12: L)
  const statusCol = 12;
  if (lastRow > 1) {
    for (let row = 2; row <= lastRow; row++) {
      const statusCell = sheet.getRange(row, statusCol);
      const status = statusCell.getValue();
      
      const statusStyles = {
        'BOOKED': { bg: '#f5f5f5', text: '#424242' },
        'DONE': { bg: '#d0d0d0', text: '#212121' },
        'CANCELLED': { bg: '#bdbdbd', text: '#000000' }
      };
      
      if (statusStyles[status]) {
        statusCell
          .setBackground(statusStyles[status].bg)
          .setFontColor(statusStyles[status].text)
          .setFontWeight('bold')
          .setHorizontalAlignment('center');
      }
    }
  }
  
  // 7. Number formatting
  // Timestamp (A)
  if (lastRow > 1) {
    sheet.getRange(2, 1, lastRow - 1, 1)
      .setNumberFormat('dd/mm/yyyy hh:mm')
      .setHorizontalAlignment('center');
  }
  
  // Tanggal (F)
  if (lastRow > 1) {
    sheet.getRange(2, 6, lastRow - 1, 1)
      .setNumberFormat('dd/mm/yyyy')
      .setHorizontalAlignment('center');
  }
  
  // Jam Start & End (G, H) — text format
  if (lastRow > 1) {
    sheet.getRange(2, 7, lastRow - 1, 2)
      .setNumberFormat('@')
      .setHorizontalAlignment('center');
  }
  
  // Durasi (I)
  if (lastRow > 1) {
    sheet.getRange(2, 9, lastRow - 1, 1)
      .setNumberFormat('0.##" jam"')
      .setHorizontalAlignment('center');
  }
  
  // DP & Harga Total (J, K)
  if (lastRow > 1) {
    sheet.getRange(2, 10, lastRow - 1, 2)
      .setNumberFormat('"Rp "#,##0')
      .setHorizontalAlignment('center');
  }
  
  // 8. Zebra banding
  if (lastRow > 1) {
    const bandingRange = sheet.getRange(2, 1, lastRow - 1, lastCol);
    const banding = bandingRange.applyRowBanding(SpreadsheetApp.BandingTheme.LIGHT_GREY);
    banding
      .setFirstRowColor('#ffffff')
      .setSecondRowColor('#f9f9f9')
      .setHeaderRowColor('#757575')
      .setFooterRowColor(null);
  }
  
  // 9. Create filter
  let filter = sheet.getFilter();
  if (filter) filter.remove();
  dataRange.createFilter();
  
  Logger.log('✅ Sheet "' + OTHER_SHEET_NAME + '" berhasil diformat!');
  return {
    success: true,
    message: 'Other Jobs sheet formatted',
    rows: lastRow,
    columns: lastCol
  };
}

/* ---------- helper tanggal & jam ---------- */

function _toISODate(v) {
  if (v === null || v === undefined || v === '') return '';
  if (v instanceof Date) {
    return Utilities.formatDate(v, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  }
  const s = String(v).trim();
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return m[1] + '-' + m[2] + '-' + m[3];
  m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
  if (m) {
    const y = m[3].length === 2 ? '20' + m[3] : m[3];
    return y + '-' + ('0' + m[2]).slice(-2) + '-' + ('0' + m[1]).slice(-2);
  }
  const d = new Date(s);
  if (!isNaN(d.getTime())) {
    return Utilities.formatDate(d, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  }
  return '';
}

function _toHHMM(v) {
  if (v === null || v === undefined || v === '') return '';
  if (v instanceof Date) {
    return Utilities.formatDate(v, Session.getScriptTimeZone(), 'HH:mm');
  }
  if (typeof v === 'number' && v >= 0 && v < 1) {
    // Google Sheets time fraction
    const total = Math.round(v * 24 * 60);
    return ('0' + Math.floor(total / 60)).slice(-2) + ':' + ('0' + (total % 60)).slice(-2);
  }
  const m = String(v).trim().match(/(\d{1,2})[:.](\d{2})/);
  if (m) return ('0' + m[1]).slice(-2) + ':' + m[2];
  return '';
}

function _minutes(hhmm) {
  const parts = String(hhmm).split(':').map(Number);
  return (parts[0] || 0) * 60 + (parts[1] || 0);
}

function _fmtMin(total) {
  return ('0' + Math.floor(total / 60)).slice(-2) + ':' + ('0' + (total % 60)).slice(-2);
}

/* ---------- agregasi semua event (wisuda + other jobs) ---------- */

/**
 * Ambil semua event dalam rentang tanggal (default: hari ini s/d +30 hari).
 * Return array terurut: {kind, jenis, subType, detail, nama, lokasi, date, start, end, status}
 */
function getAllEvents(dateFrom, dateTo) {
  const tz = Session.getScriptTimeZone();
  const today = Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd');
  if (!dateFrom) dateFrom = today;
  if (!dateTo) {
    const d = new Date();
    d.setDate(d.getDate() + 30);
    dateTo = Utilities.formatDate(d, tz, 'yyyy-MM-dd');
  }

  const ss = SpreadsheetApp.openById(CONFIG.SHEET_ID);
  const events = [];

  // --- Wisuda bookings (tab Bookings, 19 kolom) ---
  const b = ss.getSheetByName(CONFIG.SHEET_NAME);
  if (b && b.getLastRow() > 1) {
    const rows = b.getRange(2, 1, b.getLastRow() - 1, 19).getValues();
    rows.forEach(r => {
      const status = String(r[18] || '').trim();
      if (/cancel|batal/i.test(status)) return;

      const date = _toISODate(r[6]);
      if (!date || date < dateFrom || date > dateTo) return;

      const start = _toHHMM(r[7]);
      if (!start) return;

      const paket = String(r[8] || '');
      let dur = 60;
      if (/Gold/i.test(paket)) dur = 90;
      if (/Platinum/i.test(paket)) dur = 120;
      if (/Bestie/i.test(paket)) dur = 90;

      events.push({
        kind: 'WISUDA',
        jenis: 'Wisuda',
        subType: paket || 'Paket',
        detail: String(r[1] || '') + (r[4] ? ' • ' + r[4] : ''),
        nama: String(r[1] || ''),
        universitas: String(r[4] || ''),
        lokasi: String(r[5] || ''),
        date: date,
        start: start,
        end: _fmtMin(_minutes(start) + dur),
        status: status || 'BOOKED',
        source: 'wisuda'
      });
    });
  }

  // --- Other jobs ---
  const o = ss.getSheetByName(OTHER_SHEET_NAME);
  if (o && o.getLastRow() > 1) {
    const rows = o.getRange(2, 1, o.getLastRow() - 1, OTHER_HEADERS.length).getValues();
    rows.forEach(r => {
      const status = String(r[11] || '').trim();
      if (/cancel|batal/i.test(status)) return;

      const date = _toISODate(r[5]);
      if (!date || date < dateFrom || date > dateTo) return;

      const start = _toHHMM(r[6]);
      const end = _toHHMM(r[7]);
      if (!start || !end) return;

      events.push({
        kind: 'OTHER',
        jenis: String(r[1] || ''),
        subType: String(r[2] || ''),
        detail: String(r[3] || ''),
        nama: String(r[3] || ''),
        lokasi: String(r[4] || ''),
        date: date,
        start: start,
        end: end,
        dp: r[9],
        total: r[10],
        status: status || 'BOOKED',
        catatan: String(r[12] || ''),
        source: 'other'
      });
    });
  }

  events.sort((a, b2) => (a.date + a.start).localeCompare(b2.date + b2.start));
  return events;
}

/** Cek tabrakan jadwal untuk slot yang mau dipesan */
function checkConflicts(date, start, end) {
  const s = _minutes(_toHHMM(start));
  const e2 = _minutes(_toHHMM(end));
  if (isNaN(s) || isNaN(e2) || e2 <= s) return [];

  return getAllEvents(date, date).filter(ev => {
    const es = _minutes(ev.start);
    const ee = _minutes(ev.end);
    return s < ee && e2 > es; // overlap
  });
}

/**
 * Data kalender bulanan, grouped per tanggal.
 * year: 2026, month: 1-12
 */
function getCalendarMonth(year, month) {
  try {
    const tz = Session.getScriptTimeZone();
    const now = new Date();
    const y = parseInt(year, 10) || parseInt(Utilities.formatDate(now, tz, 'yyyy'), 10);
    const m = parseInt(month, 10) || parseInt(Utilities.formatDate(now, tz, 'MM'), 10);

    const pad = (n) => String(n).padStart(2, '0');
    const firstDay = y + '-' + pad(m) + '-01';
    const lastDate = new Date(y, m, 0).getDate();
    const lastDay = y + '-' + pad(m) + '-' + pad(lastDate);

    const events = getAllEvents(firstDay, lastDay);

    // Group by date
    const days = {};
    events.forEach(ev => {
      if (!days[ev.date]) days[ev.date] = [];
      days[ev.date].push({
        kind: ev.kind,
        jenis: ev.jenis,
        subType: ev.subType,
        detail: ev.detail,
        nama: ev.nama,
        universitas: ev.universitas || '',
        lokasi: ev.lokasi,
        start: ev.start,
        end: ev.end,
        status: ev.status,
        catatan: ev.catatan || ''
      });
    });

    // Summary per tanggal (jumlah job, jam sibuk)
    const summary = {};
    Object.keys(days).forEach(d => {
      const list = days[d];
      let totalMin = 0;
      list.forEach(ev => {
        const s = _minutes(ev.start), e = _minutes(ev.end);
        if (!isNaN(s) && !isNaN(e) && e > s) totalMin += (e - s);
      });
      summary[d] = {
        count: list.length,
        wisuda: list.filter(e => e.kind === 'WISUDA').length,
        other: list.filter(e => e.kind === 'OTHER').length,
        busyHours: Math.round((totalMin / 60) * 10) / 10,
        firstStart: list[0] ? list[0].start : '',
        lastEnd: list.reduce((acc, ev) => (ev.end > acc ? ev.end : acc), '')
      };
    });

    return {
      success: true,
      year: y,
      month: m,
      firstDay: firstDay,
      lastDay: lastDay,
      totalEvents: events.length,
      days: days,
      summary: summary
    };
  } catch (err) {
    Logger.log('getCalendarMonth Error: ' + err.toString());
    return { success: false, error: err.toString() };
  }
}

/** Simpan job non-wisuda */
function saveOtherJob(d) {
  const sheet = ensureOtherJobsSheet();

  const tanggal = _toISODate(d.tanggal);
  const start = _toHHMM(d.jamStart);
  const end = _toHHMM(d.jamEnd);

  if (!tanggal) throw new Error('Tanggal tidak valid: ' + d.tanggal);
  if (!start || !end) throw new Error('Jam start/end tidak valid');
  if (_minutes(end) <= _minutes(start)) throw new Error('Jam selesai harus setelah jam mulai');

  const durasi = (_minutes(end) - _minutes(start)) / 60;

  sheet.appendRow([
    new Date(),
    d.jenis || '',
    d.subType || '',
    d.detail || '',
    d.lokasi || '',
    tanggal,
    start,
    end,
    durasi,
    d.dp || 0,
    d.hargaTotal || 0,
    d.status || 'BOOKED',
    d.catatan || ''
  ]);

  return {
    success: true,
    saved: { tanggal, start, end, durasi, jenis: d.jenis, subType: d.subType }
  };
}


/* ==========================================================================
   ALBUM FOTO — untuk halaman running portfolio
   Dua tab: "Albums Running" (siklus cepat) + "Albums Event" (event besar)
   Kolom: Tanggal | Nama | Album Link | Aktif
   ========================================================================== */

const ALBUM_SHEET = 'Albums Running';
const ALBUM_HEADERS = ['Tanggal', 'Judul', 'Kategori', 'Waktu', 'Link Album', 'Aktif'];
const ALBUM_KATEGORI = ['Event', 'Harian'];
const ALBUM_WAKTU = ['Pagi', 'Sore', 'CFD'];

/** Buat tab album + header + dropdown. Jalankan sekali via ?action=setupAlbums */
function setupAlbumsSheets() {
  const ss = SpreadsheetApp.openById(CONFIG.SHEET_ID);
  const report = [];
  let sh = ss.getSheetByName(ALBUM_SHEET);
  if (!sh) {
    sh = ss.insertSheet(ALBUM_SHEET);
    report.push(ALBUM_SHEET + ' (dibuat)');
  } else {
    report.push(ALBUM_SHEET + ' (sudah ada)');
  }

  // Header
  sh.getRange(1, 1, 1, ALBUM_HEADERS.length).setValues([ALBUM_HEADERS])
    .setFontWeight('bold').setBackground('#000000').setFontColor('#ffffff');
  sh.setFrozenRows(1);

  const widths = [110, 240, 110, 100, 320, 70];
  widths.forEach(function (w, i) { sh.setColumnWidth(i + 1, w); });

  // Dropdown Kategori (kolom C) & Waktu (kolom D) untuk baris 2..1000
  const LAST = 1000;
  const katRule = SpreadsheetApp.newDataValidation()
    .requireValueInList(ALBUM_KATEGORI, true)
    .setAllowInvalid(false)
    .setHelpText('Pilih: Event atau Harian')
    .build();
  sh.getRange(2, 3, LAST, 1).setDataValidation(katRule);

  const waktuRule = SpreadsheetApp.newDataValidation()
    .requireValueInList(ALBUM_WAKTU, true)
    .setAllowInvalid(false)
    .setHelpText('Pilih: Pagi, Sore, atau CFD')
    .build();
  sh.getRange(2, 4, LAST, 1).setDataValidation(waktuRule);

  // Format tanggal kolom A
  sh.getRange(2, 1, LAST, 1).setNumberFormat('dd/mm/yyyy');

  return {
    success: true,
    sheet: report,
    headers: ALBUM_HEADERS,
    dropdownKategori: ALBUM_KATEGORI,
    dropdownWaktu: ALBUM_WAKTU
  };
}

/**
 * Baca album dari tab. Urut terbaru dulu.
 * @param {string} type 'running' atau 'event'
 */
function getAlbumsFromSheet(type) {
  const ss = SpreadsheetApp.openById(CONFIG.SHEET_ID);
  const sh = ss.getSheetByName(ALBUM_SHEET);
  if (!sh) return [];

  const lastRow = sh.getLastRow();
  if (lastRow < 2) return [];

  const rows = sh.getRange(2, 1, lastRow - 1, ALBUM_HEADERS.length).getValues();
  const out = [];
  rows.forEach(function (r) {
    const tgl      = r[0];
    const judul    = String(r[1] || '').trim();
    const kategori = String(r[2] || '').trim();   // Event / Harian
    const waktu    = String(r[3] || '').trim();   // Pagi / Sore / CFD
    const link     = String(r[4] || '').trim();
    const aktif    = r[5];

    if (!judul || !link) return;                 // lewati baris kosong
    if (link.indexOf("http") !== 0) return;      // link harus valid

    // Aktif: kosong/TRUE/ya/1 = tampil; FALSE/tidak/0 = sembunyikan
    const a = String(aktif).trim().toLowerCase();
    if (a === 'false' || a === 'tidak' || a === '0' || a === 'no') return;

    // Filter by type: event -> Kategori "Event"; running -> sisanya (Harian)
    const kat = kategori.toLowerCase();
    if (type === 'event' && kat.indexOf('event') !== 0) return;
    if (type === 'running' && kat.indexOf('event') === 0) return;

    out.push({
      tanggal: tgl instanceof Date ? Utilities.formatDate(tgl, 'Asia/Jakarta', 'yyyy-MM-dd') : String(tgl || ''),
      tanggalTampil: tgl instanceof Date ? Utilities.formatDate(tgl, 'Asia/Jakarta', 'd MMM yyyy') : String(tgl || ''),
      judul: judul,
      kategori: kategori || 'Harian',
      waktu: waktu,
      link: link,
      aktif: true,
      ts: tgl instanceof Date ? tgl.getTime() : 0
    });
  });

  // Terbaru dulu
  out.sort(function (a, b) { return b.ts - a.ts; });
  return out;
}
