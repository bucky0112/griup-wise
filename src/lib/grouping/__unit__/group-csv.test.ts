import { describe, expect, it } from 'vitest';
import { buildGroupsCsv } from '../group-csv';

const BOM = '﻿';

function rows(csv: string) {
  expect(csv.startsWith(BOM)).toBe(true);
  return csv.slice(BOM.length).split('\r\n');
}

describe('buildGroupsCsv', () => {
  it('lists members in group order, then ungrouped participants', () => {
    const csv = buildGroupsCsv(
      [
        {
          name: '火箭隊',
          members: [
            { student_no: 'S001', display_name: '王小明', total_score: 10 },
            { student_no: 'S002', display_name: '學生二', total_score: null },
          ],
        },
      ],
      [{ student_no: 'S003', display_name: '=HYPERLINK("x")' }]
    );

    expect(rows(csv)).toEqual([
      '組別,學號,姓名,分數',
      '火箭隊,S001,王小明,10',
      '火箭隊,S002,學生二,',
      '未分組,S003,"\'=HYPERLINK(""x"")",',
    ]);
  });

  it.each(['=1+1', '+1', '-1', '@SUM(A1)'])('prefixes %j so spreadsheets do not run it', (name) => {
    const [, row] = rows(buildGroupsCsv([], [{ student_no: 'S001', display_name: name }]));

    expect(row).toBe(`未分組,S001,'${name},`);
  });

  it('quotes fields with commas or line breaks', () => {
    const [, row] = rows(
      buildGroupsCsv([{ name: 'A,B', members: [{ student_no: 'S001', display_name: '王\n小明', total_score: 7.5 }] }], [])
    );

    expect(row).toBe('"A,B",S001,"王\n小明",7.5');
  });
});
