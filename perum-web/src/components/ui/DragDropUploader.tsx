'use client';

import React, { useState, useRef, DragEvent, ChangeEvent } from 'react';
import styles from './DragDropUploader.module.css';

interface DragDropUploaderProps {
    onUpload: (files: File[]) => void;
    isLoading?: boolean;
    accept?: string;
    label?: string;
    sublabel?: string;
}

export const DragDropUploader: React.FC<DragDropUploaderProps> = ({ 
    onUpload, 
    isLoading = false,
    accept = 'image/*,application/zip',
    label = 'Перетащите файлы, папки или ZIP-архив сюда',
    sublabel = 'Поддерживаются PNG, JPG, WEBP и .zip архивы'
}) => {
    const [isDragging, setIsDragging] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        setIsDragging(true);
    };

    const handleDragLeave = (e: DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        setIsDragging(false);
    };

    const traverseFileTree = async (item: any, path: string = ''): Promise<File[]> => {
        return new Promise((resolve) => {
            if (item.isFile) {
                item.file((file: File) => {
                    resolve([file]);
                });
            } else if (item.isDirectory) {
                const dirReader = item.createReader();
                dirReader.readEntries(async (entries: any[]) => {
                    let files: File[] = [];
                    for (let i = 0; i < entries.length; i++) {
                        const childFiles = await traverseFileTree(entries[i], path + item.name + '/');
                        files = files.concat(childFiles);
                    }
                    resolve(files);
                });
            } else {
                resolve([]);
            }
        });
    };

    const handleDrop = async (e: DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        setIsDragging(false);
        if (isLoading) return;

        let allFiles: File[] = [];

        if (e.dataTransfer.items) {
            for (let i = 0; i < e.dataTransfer.items.length; i++) {
                const item = e.dataTransfer.items[i].webkitGetAsEntry();
                if (item) {
                    const files = await traverseFileTree(item);
                    allFiles = allFiles.concat(files);
                }
            }
        } else {
            allFiles = Array.from(e.dataTransfer.files);
        }

        if (allFiles.length > 0) {
            onUpload(allFiles);
        }
    };

    const handleFileInput = (e: ChangeEvent<HTMLInputElement>) => {
        if (isLoading) return;
        if (e.target.files && e.target.files.length > 0) {
            onUpload(Array.from(e.target.files));
        }
        // Reset input value so the same file can be selected again
        if (fileInputRef.current) {
            fileInputRef.current.value = '';
        }
    };

    return (
        <div 
            className={`${styles.dropZone} ${isDragging ? styles.dragging : ''} ${isLoading ? styles.loading : ''}`}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
        >
            <input 
                type="file" 
                ref={fileInputRef} 
                onChange={handleFileInput} 
                className={styles.fileInput} 
                accept={accept}
                multiple 
            />
            
            <div className={styles.content}>
                {isLoading ? (
                    <div className={styles.loader}>
                        <svg className={styles.spinner} viewBox="0 0 50 50">
                            <circle className={styles.path} cx="25" cy="25" r="20" fill="none" strokeWidth="5"></circle>
                        </svg>
                        <p>Обработка файлов...</p>
                    </div>
                ) : (
                    <>
                        <svg className={styles.icon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                            <polyline points="17 8 12 3 7 8" />
                            <line x1="12" y1="3" x2="12" y2="15" />
                        </svg>
                        <p className={styles.label}>{label}</p>
                        <p className={styles.sublabel}>{sublabel}</p>
                    </>
                )}
            </div>
        </div>
    );
};
