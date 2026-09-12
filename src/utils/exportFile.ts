// Utility to export a file, using File System Access API if available, otherwise falling back to anchor download
export async function exportFile({
    data,
    filename,
    mimeType,
}: {
    data: string | Blob,
    filename: string,
    mimeType: string,
}): Promise<void> {
    const supportsFileSystemAccess = typeof window !== 'undefined' && 'showSaveFilePicker' in window;
    const blob = data instanceof Blob ? data : new Blob([data], { type: mimeType });

    if (supportsFileSystemAccess) {
        try {
            // Always prompt the user to pick a file location
            const showSaveFilePicker = (window as unknown as { showSaveFilePicker: (opts: object) => Promise<FileSystemFileHandle> }).showSaveFilePicker
            const fileHandle = await showSaveFilePicker({
                suggestedName: filename,
                types: [
                    {
                        description: mimeType + ' Files',
                        accept: { [mimeType]: [filename.slice(filename.lastIndexOf('.'))] },
                    },
                ],
            });
            if (!fileHandle) {
                throw new Error('No file handle returned from showSaveFilePicker');
            }
            const writable = await fileHandle.createWritable();
            await writable.write(blob);
            await writable.close();
            return;
        } catch (err: unknown) {
            if (typeof err === 'object' && err !== null && (err as { name?: string }).name === 'AbortError') {
                // User cancelled, do nothing
                return;
            }
            throw err;
        }
    } else {
        // Fallback: download via anchor
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        return;
    }
} 