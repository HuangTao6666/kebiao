/* 课表解析器：支持教务系统导出的 .xlsx 周课表、CSV/TSV 以及直接粘贴的表格文本。
 * 在浏览器中运行；也可被 Node 用来做语法检查（逻辑自包含，不依赖 DOM）。
 */
(function (global) {
  'use strict';

  const DAY_TOKENS = [
    ['星期一', '礼拜一', '周一', 'Monday', 'Mon', '星期一'],
    ['星期二', '礼拜二', '周二', 'Tuesday', 'Tue', '星期二'],
    ['星期三', '礼拜三', '周三', 'Wednesday', 'Wed', '星期三'],
    ['星期四', '礼拜四', '周四', 'Thursday', 'Thu', '星期四'],
    ['星期五', '礼拜五', '周五', 'Friday', 'Fri', '星期五'],
    ['星期六', '礼拜六', '周六', 'Saturday', 'Sat', '星期六'],
    ['星期日', '星期天', '礼拜日', '周日', 'Sunday', 'Sun', '星期日']
  ];

  const NUM_CHAR = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10 };

  function matchDay(text) {
    if (!text) return 0;
    const s = String(text).trim();
    for (let d = 0; d < DAY_TOKENS.length; d++) {
      for (const t of DAY_TOKENS[d]) {
        if (s === t || s.toUpperCase() === t.toUpperCase()) return d + 1;
      }
    }
    if (/^[1-7]$/.test(s)) return Number(s);
    if (s === '日' || s === '天') return 7;
    if (NUM_CHAR[s] >= 1 && NUM_CHAR[s] <= 7) return NUM_CHAR[s];
    return 0;
  }

  // 解析 "1-8" / "1,3,5" / "1-8,10-16" 之类的范围（数字列表），支持单双周标记
  function parseRanges(raw) {
    let s = String(raw || '').trim();
    let oddEven = null;
    const oddEvenMatch = s.match(/[（(]\s*([单双])\s*(?:周|週)?\s*[)）]/) || s.match(/([单双])\s*(?:周|週)?\s*$/);
    if (oddEvenMatch) {
      oddEven = (oddEvenMatch[1] === '单') ? 'odd' : 'even';
      s = s.replace(oddEvenMatch[0], '');
    }
    s = s.replace(/[周週节節]/g, '');
    const values = [];
    for (const part of s.split(/[,，、;；\s]+/)) {
      if (!part) continue;
      const m = part.match(/^(\d+)\s*[-–—~～]\s*(\d+)$/);
      if (m) {
        const a = Number(m[1]);
        const b = Number(m[2]);
        for (let i = Math.min(a, b); i <= Math.max(a, b); i++) values.push(i);
      } else if (/^\d+$/.test(part)) {
        values.push(Number(part));
      }
    }
    let list = Array.from(new Set(values)).sort((a, b) => a - b);
    if (oddEven === 'odd') list = list.filter((n) => n % 2 === 1);
    if (oddEven === 'even') list = list.filter((n) => n % 2 === 0);
    return list;
  }

  // 把数字列表压缩成 "1-8,10-16" 的展示形式
  function summarize(list, suffix) {
    const arr = (list || []).slice().sort((a, b) => a - b);
    if (!arr.length) return '';
    const parts = [];
    let start = arr[0];
    let prev = arr[0];
    for (let i = 1; i <= arr.length; i++) {
      const cur = arr[i];
      if (cur === prev + 1) { prev = cur; continue; }
      parts.push(start === prev ? String(start) : start + '-' + prev);
      start = prev = cur;
    }
    return parts.join(',') + (suffix || '');
  }

  function splitIntoBlocks(text) {
    const t = String(text || '');
    const parts = t.split(/学生[：:]\s*\d+\s*人/);
    if (parts.length > 1) return parts;
    // 兼容其它导出格式：按空行分块
    return t.split(/\n\s*\n+/);
  }

  function linesOf(chunk) {
    return String(chunk || '')
      .split(/\r?\n/)
      .map((l) => l.replace(/\r/g, '').trim())
      .filter((l) => l.length > 0);
  }

  function cleanRoom(line) {
    let l = String(line || '').trim();
    const m = l.match(/^(.*?)[（(]([^（）()]*)[)）]\s*$/);
    if (m) {
      const head = m[1].trim();
      const inner = m[2].trim();
      if (inner && head.startsWith(inner)) l = head;
    }
    return l;
  }

  // 解析一个课程文本块（教务系统导出格式）
  function parseCourseBlock(chunk) {
    const lines = linesOf(chunk);
    if (!lines.length) return null;
    const c = {
      name: '',
      nature: '',
      exam: '',
      teacher: '',
      room: '',
      weeks: [],
      periods: [],
      note: '',
      noTime: false
    };

    // 单行自由文本（如网课行）：拆出 课程名 / 教师 / 周次
    if (lines.length === 1) {
      let line = lines[0];
      const wk = line.match(/\[([^\]]*周[^\]]*)\]\s*$/);
      if (wk) {
        c.weeks = parseRanges(wk[1]);
        line = line.slice(0, wk.index).trim();
      }
      const tc = line.match(/(\S+-\S+\[\S*\]\s*;?)\s*$/);
      if (tc) {
        c.teacher = tc[1].replace(/[\[\];\s]+$/g, '').split(/[-–—]/)[0].trim();
        line = line.slice(0, tc.index).trim();
      }
      lines[0] = line;
      if (!line) return null;
    }

    // 第一行：课程名(选修/必修)[考试/考查]
    let nameLine = lines[0];
    nameLine = nameLine.replace(/[（(](必修|选修|限选|任选|公选|专选|实践|实训)[)）]/g, (m, g) => { c.nature = g; return ''; });
    nameLine = nameLine.replace(/[\[【](考试|考查)[\]】]/g, (m, g) => { c.exam = g; return ''; });
    c.name = nameLine.replace(/\s+/g, ' ').trim();

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i];
      // 周次/节次行：[1-8周] [1-2]
      const wp = line.match(/^\s*\[([^\]]*)\]\s*(?:\[([^\]]*)\])?\s*$/);
      if (wp && (/周|週/.test(wp[1]) || /^\d/.test(wp[1]))) {
        c.weeks = parseRanges(wp[1]);
        if (wp[2] !== undefined && wp[2] !== null && wp[2] !== '') c.periods = parseRanges(wp[2]);
        continue;
      }
      // 单方括号的周次：[1-8周]
      const wOnly = line.match(/^\s*\[([^\]]*周[^\]]*)\]\s*$/);
      if (wOnly) {
        c.weeks = parseRanges(wOnly[1]);
        continue;
      }
      // 教师行：夏娟-04884[主讲];
      const teacherMatch = line.match(/^([^[\]\-–—]+?)(?:\s*[-–—]\s*\S+)?(\[[^\]]*\])?;?\s*$/);
      if (teacherMatch && (line.includes('[') || /主讲|教师|老师|辅导/.test(line))) {
        c.teacher = teacherMatch[1].trim();
        continue;
      }
      if (/^(组班|班级|合班)[：:]/.test(line)) {
        c.note = line.replace(/\s+/g, ' ').trim();
        continue;
      }
      if (/^(学生|人数)[：:]/.test(line)) continue;
      if (/^(教室|地点|上课地点|周次|节次)[：:]/.test(line)) {
        c.room = line.replace(/^(教室|地点|上课地点)[：:]\s*/, '');
        continue;
      }
      // 其余行按教师/教室启发式归类
      if (!c.room && /楼|教室|实验室|机房|馆|场|-\d|\d{3,}/.test(line) && !/^\s*\[/.test(line)) {
        c.room = cleanRoom(line);
        continue;
      }
      if (!c.teacher && /老师|教授|讲师|主讲/.test(line)) {
        c.teacher = line.replace(/老师|教授|讲师|主讲/g, '').replace(/[\[\];：:]+/g, '').trim();
        continue;
      }
      if (!c.room) c.room = cleanRoom(line);
    }
    if (!c.name) return null;
    if (!c.periods.length) c.noTime = true;
    return c;
  }

  // 解析一个格子里的整段文本（可能包含多门课）
  function parseBlocksText(text, day) {
    const out = [];
    for (const chunk of splitIntoBlocks(text)) {
      const c = parseCourseBlock(chunk);
      if (!c) continue;
      c.day = day || 0;
      if (c.noTime && day) c.noTime = false;
      out.push(c);
    }
    return out;
  }

  function periodFromLabel(label) {
    const s = String(label || '').trim();
    if (!s) return null;
    const pair = s.match(/[第]?\s*(\d+)\s*[-–—~～]\s*(\d+)\s*节?/);
    if (pair) return { start: Number(pair[1]), end: Number(pair[2]) };
    const single = s.match(/(\d+)\s*节?/);
    if (single && !/周/.test(s)) return { start: Number(single[1]), end: Number(single[1]) };
    if (/^[一二三四五六七八九十]$/.test(s)) {
      const n = NUM_CHAR[s];
      return { start: n * 2 - 1, end: n * 2 };
    }
    return null;
  }

  // 通用兜底：一个格子里只有一门课的简单格式
  function parsePlainCell(text, day, periodPair) {
    const lines = linesOf(text);
    if (!lines.length) return [];
    const c = {
      name: lines[0].replace(/\s+/g, ' ').trim(),
      nature: '', exam: '', teacher: '', room: '', weeks: [], note: '', noTime: false
    };
    const weekMatch = String(text).match(/(\d+(?:\s*[-–—~]\s*\d+)?(?:\s*[,，、]\s*\d+(?:\s*[-–—~]\s*\d+)?)*)\s*周/);
    if (weekMatch) c.weeks = parseRanges(weekMatch[1]);
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i];
      if (/老师|教授|讲师|主讲/.test(line)) c.teacher = line.replace(/老师|教授|讲师|主讲/g, '').trim();
      else if (/楼|教室|实验室|机房|馆|场|\d{3,}/.test(line)) c.room = cleanRoom(line);
      else c.note = line;
    }
    c.day = day;
    c.periods = periodPair ? rangeToArray(periodPair.start, periodPair.end) : [];
    if (!c.periods.length) c.noTime = true;
    return [c];
  }

  function rangeToArray(a, b) {
    const out = [];
    for (let i = Math.min(a, b); i <= Math.max(a, b); i++) out.push(i);
    return out;
  }

  function dedup(courses) {
    const map = new Map();
    for (const raw of courses) {
      const key = [raw.day, raw.name, raw.nature, raw.teacher, raw.room, raw.note, raw.noTime ? 1 : 0].join('\u0001');
      const ex = map.get(key);
      if (!ex) {
        map.set(key, {
          day: raw.day,
          name: raw.name,
          nature: raw.nature,
          exam: raw.exam,
          teacher: raw.teacher,
          room: raw.room,
          note: raw.note,
          noTime: !!raw.noTime,
          weeks: new Set(raw.weeks || []),
          periods: new Set(raw.periods || [])
        });
      } else {
        for (const w of (raw.weeks || [])) ex.weeks.add(w);
        for (const p of (raw.periods || [])) ex.periods.add(p);
      }
    }
    const result = [];
    for (const c of map.values()) {
      const weeks = Array.from(c.weeks).sort((a, b) => a - b);
      const periods = Array.from(c.periods).sort((a, b) => a - b);
      result.push({
        day: c.day,
        name: c.name,
        nature: c.nature,
        exam: c.exam,
        teacher: c.teacher,
        room: c.room,
        note: c.note,
        noTime: c.noTime,
        weeks,
        weekText: summarize(weeks, '周'),
        periods,
        periodText: summarize(periods, '节')
      });
    }
    result.sort((a, b) => (a.day - b.day) || (a.noTime - b.noTime) || (a.periods[0] || 0) - (b.periods[0] || 0) || a.name.localeCompare(b.name));
    return result;
  }

  function parseGridTable(grid) {
    const h = grid.length;
    if (!h) return null;
    let headerRow = -1;
    let dayMap = {};
    for (let r = 0; r < Math.min(h, 8); r++) {
      const row = grid[r] || [];
      const map = {};
      let count = 0;
      for (let c = 0; c < row.length; c++) {
        const d = matchDay(row[c]);
        if (d) { map[c] = d; count++; }
      }
      if (count >= 2) { headerRow = r; dayMap = map; break; }
    }
    if (headerRow < 0) return null;

    const courses = [];
    let maxPeriod = 0;
    for (let r = headerRow + 1; r < h; r++) {
      const row = grid[r] || [];
      const label = (row[0] || '').trim();
      const periodPair = periodFromLabel(label);
      const isOther = /占周|不占时间|网课|慕课|线上|其他|备注/.test(label);
      for (const cStr in dayMap) {
        const cIdx = Number(cStr);
        const day = dayMap[cIdx];
        const text = (row[cIdx] || '').trim();
        if (!text) continue;
        if (isOther || /占周不占时间|线上课程|网络课/.test(text)) {
          courses.push(...parseBlocksText(text, 0).map((x) => { x.noTime = true; x.day = 0; return x; }));
          continue;
        }
        const cs = text.includes('学生：') ? parseBlocksText(text, day) : parsePlainCell(text, day, periodPair);
        for (const x of cs) {
          if (x.periods && x.periods.length) {
            const mx = Math.max(...x.periods);
            if (mx > maxPeriod) maxPeriod = mx;
          }
        }
        courses.push(...cs);
      }
      if (periodPair && periodPair.end > maxPeriod) maxPeriod = periodPair.end;
    }
    return { courses: dedup(courses), maxPeriod: maxPeriod || 10 };
  }

  function parseListTable(grid) {
    const h = grid.length;
    if (!h) return null;
    let headerRow = -1;
    let cols = {};
    for (let r = 0; r < Math.min(h, 10); r++) {
      const row = grid[r] || [];
      const map = {};
      let score = 0;
      for (let c = 0; c < row.length; c++) {
        const v = String(row[c] || '').trim();
        if (/周次|周别|教学周/.test(v)) { map.weeks = c; score++; }
        else if (/^星期|周$|周[一二三四五六日天]|星期/.test(v)) { map.day = c; score++; }
        else if (/节次|节$|节/.test(v)) { map.periods = c; score++; }
        else if (/课程|名称|科目/.test(v)) { map.name = c; score++; }
        else if (/教师|老师/.test(v)) { map.teacher = c; score++; }
        else if (/教室|地点|场所/.test(v)) { map.room = c; score++; }
      }
      if (score >= 3 && map.weeks !== undefined && map.name !== undefined) { headerRow = r; cols = map; break; }
    }
    if (headerRow < 0) return null;
    const courses = [];
    let maxPeriod = 0;
    for (let r = headerRow + 1; r < h; r++) {
      const row = grid[r] || [];
      const name = String(row[cols.name] || '').trim();
      if (!name) continue;
      const weeks = cols.weeks !== undefined ? parseRanges(row[cols.weeks]) : [];
      const day = cols.day !== undefined ? matchDay(row[cols.day]) : 0;
      const periods = cols.periods !== undefined ? parseRanges(row[cols.periods]) : [];
      const teacher = cols.teacher !== undefined ? String(row[cols.teacher] || '').trim() : '';
      const room = cols.room !== undefined ? String(row[cols.room] || '').trim() : '';
      if (periods.length) maxPeriod = Math.max(maxPeriod, Math.max(...periods));
      courses.push({
        day, name, nature: '', exam: '', teacher, room,
        note: '', noTime: !periods.length,
        weeks, periods
      });
    }
    return { courses: dedup(courses), maxPeriod: maxPeriod || 10 };
  }

  // CSV/TSV 文本 -> 二维网格（支持引号内的换行与引号转义）
  function parseDelimited(text) {
    const t = String(text || '').replace(/^\uFEFF/, '');
    let delim = '\t';
    if (!t.includes('\t')) {
      const commas = (t.match(/,/g) || []).length;
      const semis = (t.match(/;/g) || []).length;
      delim = commas >= semis ? ',' : ';';
    }
    const rows = [];
    let row = [];
    let cell = '';
    let inQuotes = false;
    for (let i = 0; i < t.length; i++) {
      const ch = t[i];
      if (inQuotes) {
        if (ch === '"') {
          if (t[i + 1] === '"') { cell += '"'; i++; } else { inQuotes = false; }
        } else cell += ch;
      } else if (ch === '"') {
        inQuotes = true;
      } else if (ch === delim) {
        row.push(cell); cell = '';
      } else if (ch === '\n') {
        row.push(cell); cell = '';
        rows.push(row); row = [];
      } else if (ch === '\r') {
        // 忽略
      } else {
        cell += ch;
      }
    }
    row.push(cell);
    if (row.length > 1 || row[0] !== '') rows.push(row);
    return rows;
  }

  function parseGridText(text) {
    const grid = parseDelimited(text);
    const fromGrid = parseGridTable(grid);
    if (fromGrid && fromGrid.courses.length) return fromGrid;
    const fromList = parseListTable(grid);
    if (fromList && fromList.courses.length) return fromList;
    return null;
  }

  /* ---------- xlsx 读取（ZIP + XML，无需第三方库） ---------- */

  function readU16(le) {
    return function (bytes, offset) {
      return bytes[offset] | (bytes[offset + 1] << 8);
    };
  }
  function readU32(bytes, offset) {
    return (bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16) | (bytes[offset + 3] << 24)) >>> 0;
  }

  function findEOCD(bytes) {
    const minStart = Math.max(0, bytes.length - 22 - 65535);
    for (let i = bytes.length - 22; i >= minStart; i--) {
      if (bytes[i] === 0x50 && bytes[i + 1] === 0x4b && bytes[i + 2] === 0x05 && bytes[i + 3] === 0x06) return i;
    }
    return -1;
  }

  async function inflateRaw(data) {
    if (typeof DecompressionStream === 'undefined') throw new Error('当前浏览器不支持解压 xlsx，请换用新版浏览器');
    const ds = new DecompressionStream('deflate-raw');
    const stream = new Blob([data]).stream().pipeThrough(ds);
    return new Uint8Array(await new Response(stream).arrayBuffer());
  }

  async function unzip(arrayBuffer) {
    const bytes = new Uint8Array(arrayBuffer);
    const eocd = findEOCD(bytes);
    if (eocd < 0) throw new Error('文件损坏或不是有效的 xlsx');
    const total = bytes[eocd + 10] | (bytes[eocd + 11] << 8);
    let off = readU32(bytes, eocd + 16);
    const files = {};
    for (let i = 0; i < total; i++) {
      if (readU32(bytes, off) !== 0x02014b50) break;
      const method = bytes[off + 10] | (bytes[off + 11] << 8);
      const compSize = readU32(bytes, off + 20);
      const nameLen = bytes[off + 28] | (bytes[off + 29] << 8);
      const extraLen = bytes[off + 30] | (bytes[off + 31] << 8);
      const commentLen = bytes[off + 32] | (bytes[off + 33] << 8);
      const localOffset = readU32(bytes, off + 42);
      let name = '';
      for (let k = 0; k < nameLen; k++) name += String.fromCharCode(bytes[off + 46 + k]);
      if (readU32(bytes, localOffset) === 0x04034b50) {
        const lNameLen = bytes[localOffset + 26] | (bytes[localOffset + 27] << 8);
        const lExtraLen = bytes[localOffset + 28] | (bytes[localOffset + 29] << 8);
        const dataStart = localOffset + 30 + lNameLen + lExtraLen;
        const raw = bytes.slice(dataStart, dataStart + compSize);
        files[name] = method === 8 ? await inflateRaw(raw) : raw;
      }
      off += 46 + nameLen + extraLen + commentLen;
    }
    return files;
  }

  function xmlDoc(text) {
    if (typeof DOMParser === 'undefined') throw new Error('当前环境不支持 XML 解析');
    return new DOMParser().parseFromString(text, 'application/xml');
  }

  function colToIndex(ref) {
    let n = 0;
    for (const ch of ref) {
      if (ch >= 'A' && ch <= 'Z') n = n * 26 + (ch.charCodeAt(0) - 64);
      else if (ch >= 'a' && ch <= 'z') n = n * 26 + (ch.charCodeAt(0) - 96);
      else break;
    }
    return n - 1;
  }

  function sharedStringsFrom(xmlText) {
    const doc = xmlDoc(xmlText);
    const out = [];
    const sis = doc.getElementsByTagName('si');
    for (let i = 0; i < sis.length; i++) {
      const ts = sis[i].getElementsByTagName('t');
      let s = '';
      for (let j = 0; j < ts.length; j++) s += ts[j].textContent;
      out.push(s);
    }
    return out;
  }

  function sheetToGrid(xmlText, shared) {
    const doc = xmlDoc(xmlText);
    const rows = [];
    const rowEls = doc.getElementsByTagName('row');
    for (let i = 0; i < rowEls.length; i++) {
      const rowEl = rowEls[i];
      const rIdx = Number(rowEl.getAttribute('r')) - 1;
      if (!Number.isFinite(rIdx) || rIdx < 0) continue;
      const cells = rowEl.getElementsByTagName('c');
      const rowArr = [];
      for (let j = 0; j < cells.length; j++) {
        const cell = cells[j];
        const ref = cell.getAttribute('r');
        if (!ref) continue;
        const cIdx = colToIndex(ref);
        const type = cell.getAttribute('t');
        let value = '';
        if (type === 'inlineStr') {
          const ts = cell.getElementsByTagName('t');
          for (let k = 0; k < ts.length; k++) value += ts[k].textContent;
        } else {
          const v = cell.getElementsByTagName('v')[0];
          if (v) value = v.textContent || '';
          if (type === 's' && shared && shared[Number(value)] !== undefined) value = shared[Number(value)];
        }
        rowArr[cIdx] = value;
      }
      rows[rIdx] = rowArr;
    }
    // 展开合并单元格
    const merges = doc.getElementsByTagName('mergeCell');
    for (let i = 0; i < merges.length; i++) {
      const ref = merges[i].getAttribute('ref') || '';
      const m = ref.match(/^([A-Za-z]+)(\d+):([A-Za-z]+)(\d+)$/);
      if (!m) continue;
      const r1 = Number(m[2]) - 1;
      const r2 = Number(m[4]) - 1;
      const c1 = colToIndex(m[1]);
      const c2 = colToIndex(m[3]);
      const src = (rows[r1] || [])[c1];
      if (src === undefined || src === null) continue;
      for (let r = r1; r <= r2; r++) {
        rows[r] = rows[r] || [];
        for (let c = c1; c <= c2; c++) {
          if (rows[r][c] === undefined || rows[r][c] === '') rows[r][c] = src;
        }
      }
    }
    return rows;
  }

  async function parseXlsx(arrayBuffer) {
    const files = await unzip(arrayBuffer);
    const decoder = new TextDecoder('utf-8');
    const shared = files['xl/sharedStrings.xml'] ? sharedStringsFrom(decoder.decode(files['xl/sharedStrings.xml'])) : [];
    const sheetNames = Object.keys(files)
      .filter((n) => /^xl\/worksheets\/sheet\d+\.xml$/.test(n))
      .sort((a, b) => Number((a.match(/\d+/) || [0])[0]) - Number((b.match(/\d+/) || [0])[0]));
    if (!sheetNames.length) throw new Error('xlsx 中没有找到工作表');
    const grid = sheetToGrid(decoder.decode(files[sheetNames[0]]), shared);
    const parsed = parseGridTable(grid) || parseListTable(grid);
    if (!parsed || !parsed.courses.length) throw new Error('未能识别课表结构，请尝试在 Excel 中复制表格后粘贴到应用');
    return parsed;
  }

  async function parseFile(arrayBuffer, filename) {
    const name = String(filename || '').toLowerCase();
    if (name.endsWith('.xlsx')) return parseXlsx(arrayBuffer);
    if (name.endsWith('.xls')) throw new Error('暂不支持旧版 .xls，请在 Excel 里另存为 .xlsx，或直接复制表格粘贴');
    const text = new TextDecoder('utf-8').decode(arrayBuffer);
    const parsed = parseGridText(text);
    if (!parsed || !parsed.courses.length) throw new Error('未能识别课表结构，请尝试复制表格后粘贴');
    return parsed;
  }

  const api = {
    parseFile,
    parseGridText,
    parseBlocksText,
    parseRanges,
    summarize,
    matchDay,
    dedup
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  global.KBParser = api;
})(typeof window !== 'undefined' ? window : globalThis);
