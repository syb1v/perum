type ExcelRow = Record<string, string | number | boolean | null | undefined>;

export const exportToExcel = async (tableData: ExcelRow[], filename: string) => {
    try {
        const columns = Array.from(new Set(tableData.flatMap(row => Object.keys(row))));
        const escape = (value: ExcelRow[string]) => {
            const text = value == null ? '' : String(value);
            return `"${text.replaceAll('"', '""')}"`;
        };
        const csv = [
            columns.map(escape).join(';'),
            ...tableData.map(row => columns.map(column => escape(row[column])).join(';')),
        ].join('\r\n');
        const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `${filename}.csv`;
        link.click();
        URL.revokeObjectURL(url);
    } catch (error) {
        console.error('Failed to generate Excel:', error);
        throw error;
    }
};
