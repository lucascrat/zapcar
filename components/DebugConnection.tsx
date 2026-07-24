import React, { useEffect, useState } from 'react';
import { supabase } from '../services/supabaseClient';
import { SUPABASE_SCHEMA, SUPABASE_URL } from '../constants';

export const DebugConnection: React.FC = () => {
    const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
    const [details, setDetails] = useState<string>('Testando conexão...');
    const [userCount, setUserCount] = useState<number | null>(null);

    const checkConnection = async () => {
        setStatus('loading');
        try {
            // 1. Check basic connection via profiles count
            const { count, error, status: httpStatus } = await supabase
                .from('profiles')
                .select('*', { count: 'exact', head: true });

            if (error) {
                setStatus('error');
                // Melhorar o diagnóstico de erro
                const errorStr = JSON.stringify(error, null, 2);
                const is406 = httpStatus === 406 || (error as any)?.status === 406;
                const schemaHint = is406
                  ? `\n\nDiagnóstico: schema '${SUPABASE_SCHEMA}' não está exposto na API.\nAjuste no Supabase/Coolify: Exposed schemas ou PGRST_DB_SCHEMAS incluindo '${SUPABASE_SCHEMA}'.`
                  : '';
                setDetails(`URL: ${SUPABASE_URL}\nSchema: ${SUPABASE_SCHEMA}\nHTTP: ${httpStatus ?? 'N/A'}\n\nErro ao conectar:\n${error.message || 'Sem mensagem'}\nCode: ${error.code || 'N/A'}\nHint: ${error.hint || 'N/A'}\nFull: ${errorStr}${schemaHint}`);
                console.error("Debug Connection Error:", error);
            } else {
                setStatus('success');
                setDetails('Conectado ao Supabase com sucesso!');
                setUserCount(count);
                
                // Try to list one user for schema validation
                const { data: userData, error: userError } = await supabase
                    .from('profiles')
                    .select('role, username')
                    .limit(1);
                    
                if (userError) {
                    const userErrStr = JSON.stringify(userError, null, 2);
                    setDetails(prev => `${prev}\nLeitura de profiles falhou (RLS/permissão?): ${userError.message || 'Sem mensagem'}\nFull: ${userErrStr}`);
                } else if (userData && userData.length > 0) {
                    setDetails(prev => `${prev}\nSchema OK. Exemplo: ${userData[0].username} (${userData[0].role})`);
                } else {
                    setDetails(prev => `${prev}\nTabela profiles parece vazia.`);
                }
            }
        } catch (e: any) {
            setStatus('error');
            setDetails(`Exceção: ${e.message}`);
        }
    };

    useEffect(() => {
        checkConnection();
    }, []);

    if (status === 'success') return null; // Hide if all good (or keep small indicator)

    return (
        <div className="fixed bottom-0 left-0 right-0 bg-gray-900 text-white p-4 text-xs font-mono z-[9999] opacity-90">
            <div className="flex justify-between items-start">
                <div>
                    <strong className={status === 'error' ? 'text-red-400' : 'text-green-400'}>
                        STATUS DB: {status.toUpperCase()}
                    </strong>
                    <pre className="mt-2 whitespace-pre-wrap text-gray-300">
                        {details}
                    </pre>
                    {userCount !== null && (
                        <div className="mt-1 text-blue-300">Usuários encontrados: {userCount}</div>
                    )}
                </div>
                <button 
                    onClick={checkConnection}
                    className="bg-blue-600 px-3 py-1 rounded text-white hover:bg-blue-500"
                >
                    Retestar
                </button>
            </div>
        </div>
    );
};
