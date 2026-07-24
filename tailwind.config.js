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
            colors: {
                'whatsapp-green': '#00a884',
                'whatsapp-dark': '#111b21',
                'whatsapp-panel': '#202c33',
                'whatsapp-incoming': '#202c33',
                'whatsapp-outgoing': '#005c4b',
                'app-bg': '#111b21'
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
