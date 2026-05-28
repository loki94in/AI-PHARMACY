import path from 'path';

export const getAppDataPath = (subDir: string) => {
    const base = process.env.APPDATA || process.cwd();
    return path.join(base, 'ai-pharmacy', subDir);
};
