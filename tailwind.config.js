/** @type {import('tailwindcss').Config} */
export default {
    content: [
        "./index.html",
        "./*.{tsx,ts,jsx,js}",
        "./components/**/*.{js,ts,jsx,tsx}",
        "./src/**/*.{js,ts,jsx,tsx}",
    ],
    theme: {
        extend: {
            fontFamily: {
                sans: ['Inter', '-apple-system', 'Segoe UI', 'Roboto', 'Helvetica', 'Arial', 'sans-serif'],
            },
            colors: {
                'whatsapp-green': '#00a884',
                'whatsapp-dark': '#111b21',
                'whatsapp-panel': '#202c33',
                'whatsapp-incoming': '#202c33',
                'whatsapp-outgoing': '#005c4b',
                'app-bg': '#111b21',
                // Acento único da UI (CTAs, seleção, destaques) - separado das
                // cores semânticas (verde=sucesso/online, vermelho=perigo).
                accent: {
                    50: '#FDF2E4',
                    100: '#FBE3C4',
                    200: '#F7CD97',
                    300: '#F2B76A',
                    400: '#EDA34C',
                    500: '#E8A23D',
                    600: '#C97A1F',
                    700: '#A8631A',
                    800: '#7A4813',
                    900: '#4D2E0C',
                    DEFAULT: '#E8A23D',
                    ink: '#241A05',
                },
                // Cor da marca - verde limão (combina com a logo). Substitui o
                // amarelo que vinha do layout inspirado no 99. Tom claro o bastante
                // para texto escuro (gray-900) permanecer legível sobre brand-400.
                brand: {
                    50: '#f3faea',
                    100: '#e2f3c7',
                    200: '#cbe89b',
                    300: '#b0db6b',
                    400: '#95cc3f',
                    500: '#7fb62f',
                    600: '#639122',
                    700: '#4d6f1c',
                    800: '#3a5417',
                    900: '#2b3f12',
                    DEFAULT: '#95cc3f',
                    ink: '#18240a',
                },
            },
            gridTemplateColumns: {
                '15': 'repeat(15, minmax(0, 1fr))',
            },
            spacing: {
                'safe': 'env(safe-area-inset-bottom)',
            },
            animation: {
                'slide-up-mobile': 'slideUpMobile 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards',
                'fade-in': 'fadeIn 0.3s ease-out forwards',
                'marquee': 'marquee 25s linear infinite',
                'shimmer': 'shimmer 2s linear infinite',
            },
            keyframes: {
                slideUpMobile: {
                    '0%': { transform: 'translateY(100%)' },
                    '100%': { transform: 'translateY(0)' },
                },
                fadeIn: {
                    '0%': { opacity: '0', transform: 'scale(0.95)' },
                    '100%': { opacity: '1', transform: 'scale(1)' },
                },
                marquee: {
                    '0%': { transform: 'translateX(100%)' },
                    '100%': { transform: 'translateX(-100%)' }
                },
                shimmer: {
                    '0%': { backgroundPosition: '-1000px 0' },
                    '100%': { backgroundPosition: '1000px 0' }
                }
            }
        }
    },
    plugins: [],
}
