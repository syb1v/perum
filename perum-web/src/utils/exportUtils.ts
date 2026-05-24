type ExcelRow = Record<string, string | number | boolean | null | undefined>;

export const exportToExcel = async (tableData: ExcelRow[], filename: string) => {
    try {
        const XLSX = await import('xlsx');
        const worksheet = XLSX.utils.json_to_sheet(tableData);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, 'Report');
        XLSX.writeFile(workbook, `${filename}.xlsx`);
    } catch (error) {
        console.error('Failed to generate Excel:', error);
        throw error;
    }
};
