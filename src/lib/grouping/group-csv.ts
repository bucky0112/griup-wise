interface CsvMember {
  student_no: string;
  display_name: string;
  total_score: number | null;
}

interface CsvGroup {
  name: string;
  members: CsvMember[];
}

interface CsvUngrouped {
  student_no: string;
  display_name: string;
}

const HEADER = ['組別', '學號', '姓名', '分數'];
const UNGROUPED_LABEL = '未分組';

// Names are typed by students, so a leading formula character is neutralised before a spreadsheet sees it
function csvField(value: string): string {
  const safe = /^[=+\-@]/.test(value) ? `'${value}` : value;
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

/**
 * The group list as a CSV for spreadsheets: a BOM so Excel reads UTF-8, CRLF rows, members in the given group
 * and rank order, then ungrouped participants. Unsubmitted scores are left empty.
 */
export function buildGroupsCsv(groups: CsvGroup[], ungrouped: CsvUngrouped[]): string {
  const rows = [
    HEADER,
    ...groups.flatMap((group) =>
      group.members.map((m) => [group.name, m.student_no, m.display_name, m.total_score === null ? '' : String(m.total_score)])
    ),
    ...ungrouped.map((p) => [UNGROUPED_LABEL, p.student_no, p.display_name, '']),
  ];
  return '﻿' + rows.map((row) => row.map(csvField).join(',')).join('\r\n');
}
