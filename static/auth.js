// Toggle global de logs de debug (idempotente) — por padrão, desabilita console.log
(function(){
    if (typeof window === 'undefined' || typeof console === 'undefined') return;
    if (window.__logToggleInit) return; // já inicializado por outro arquivo
    window.__logToggleInit = true;

    try {
        if (!console.__origLog && typeof console.log === 'function') {
            console.__origLog = console.log.bind(console);
        }
            window.enableDebugLogs = function(){
                if (console.__origLog) console.log = console.__origLog;
                console.__silenced = false;
                window.DEBUG = true;
            };
            window.disableDebugLogs = function(){
                console.log = function(){};
                console.__silenced = true;
                window.DEBUG = false;
            };
        // desabilita por padrão
        window.disableDebugLogs();
    } catch(_) {}
})();

// Sistema de Autenticação
class AuthManager {
    constructor() {
        this.isAuthenticated = false;
        this.init();
    }

    init() {
        // Bloquear o acesso inicial
        this.blockApp();
        
        // Mostrar modal de autenticação imediatamente
        this.showAuthModal();
    }

    blockApp() {
        // Esconder todo o conteúdo da página
        document.body.style.visibility = 'hidden';
        console.log('🔒 Aplicação bloqueada - autenticação necessária');
    }

    unblockApp() {
        // Mostrar o conteúdo da página
        document.body.style.visibility = 'visible';
        console.log('🔓 Aplicação desbloqueada - usuário autenticado');
    }

    showAuthModal() {
        // Criar modal de autenticação
        const modalHTML = `
            <div id="auth-modal" style="
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background: rgba(0,0,0,0.8);
                display: flex;
                justify-content: center;
                align-items: center;
                z-index: 9999;
                visibility: visible;
            ">
                <div style="
                    background: white;
                    padding: 30px;
                    border-radius: 10px;
                    box-shadow: 0 4px 20px rgba(0,0,0,0.3);
                    text-align: center;
                    min-width: 350px;
                ">
                    <h2 style="margin-bottom: 20px; color: #333;">🔐 Acesso Restrito</h2>
                    <p style="margin-bottom: 20px; color: #666;">Digite a senha para acessar o sistema</p>
                    
                    <div style="margin-bottom: 20px;">
                        <input 
                            type="password" 
                            id="auth-password" 
                            placeholder="Digite a senha..."
                            style="
                                width: 100%;
                                padding: 12px;
                                border: 2px solid #ddd;
                                border-radius: 5px;
                                font-size: 16px;
                                box-sizing: border-box;
                            "
                        />
                    </div>
                    
                    <button 
                        id="auth-submit"
                        style="
                            background: #007bff;
                            color: white;
                            border: none;
                            padding: 12px 30px;
                            border-radius: 5px;
                            font-size: 16px;
                            cursor: pointer;
                            width: 100%;
                        "
                    >
                        Entrar
                    </button>
                    
                    <div id="auth-error" style="
                        color: #dc3545;
                        margin-top: 15px;
                        display: none;
                    "></div>
                </div>
            </div>
        `;

        // Adicionar modal ao body
        document.body.insertAdjacentHTML('beforeend', modalHTML);

        // Configurar eventos
        this.setupAuthEvents();
    }

    setupAuthEvents() {
        const passwordInput = document.getElementById('auth-password');
        const submitBtn = document.getElementById('auth-submit');
        const errorDiv = document.getElementById('auth-error');

        // Enter no input de senha
        passwordInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.authenticateUser();
            }
        });

        // Clique no botão
        submitBtn.addEventListener('click', () => {
            this.authenticateUser();
        });

        // Focar no input
        setTimeout(() => passwordInput.focus(), 100);
    }

    async authenticateUser() {
        const passwordInput = document.getElementById('auth-password');
        const submitBtn = document.getElementById('auth-submit');
        const errorDiv = document.getElementById('auth-error');
        
        const password = passwordInput.value.trim();

        if (!password) {
            this.showError('Por favor, digite a senha');
            return;
        }

        // Desabilitar botão durante autenticação
        submitBtn.disabled = true;
        submitBtn.textContent = 'Verificando...';

        try {
            const response = await fetch('/auth', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ password: password })
            });

            const result = await response.json();

            if (result.sucesso) {
                this.isAuthenticated = true;
                this.onAuthSuccess();
            } else {
                this.showError('Senha incorreta. Tente novamente.');
            }

        } catch (error) {
            console.error('Erro na autenticação:', error);
            this.showError('Erro de conexão. Tente novamente.');
        } finally {
            // Reabilitar botão
            submitBtn.disabled = false;
            submitBtn.textContent = 'Entrar';
        }
    }

    showError(message) {
        const errorDiv = document.getElementById('auth-error');
        const passwordInput = document.getElementById('auth-password');
        
        errorDiv.textContent = message;
        errorDiv.style.display = 'block';
        
        // Limpar senha e focar no input
        passwordInput.value = '';
        passwordInput.focus();

        // Esconder erro após 3 segundos
        setTimeout(() => {
            errorDiv.style.display = 'none';
        }, 3000);
    }

    onAuthSuccess() {
        console.log('✅ Autenticação realizada com sucesso');
        
        // Remover modal
        const modal = document.getElementById('auth-modal');
        if (modal) {
            modal.remove();
        }

        // Desbloquear aplicação
        this.unblockApp();

        // Inicializar aplicação
        this.initializeApp();
    }

    initializeApp() {
        console.log('🚀 Inicializando aplicação...');
        
        // Carregar dados da API se a função existir
        if (typeof carregarDadosAPI === 'function') {
            carregarDadosAPI();
        }

        // Outras inicializações podem ser adicionadas aqui
        console.log('✅ Aplicação inicializada');
    }

    async logout() {
        try {
            await fetch('/logout', { method: 'POST' });
            
            // Recarregar página para mostrar tela de login novamente
            window.location.reload();
            
        } catch (error) {
            console.error('Erro no logout:', error);
        }
    }
}

// Inicializar sistema de autenticação quando a página carregar
document.addEventListener('DOMContentLoaded', () => {
    window.authManager = new AuthManager();
});

// Função global para logout (pode ser chamada de qualquer lugar)
window.logout = () => {
    if (window.authManager) {
        window.authManager.logout();
    }
};
