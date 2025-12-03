import OneSignal from 'onesignal-cordova-plugin';

export const OneSignalInit = () => {
    try {
        // Initialize OneSignal
        OneSignal.initialize("664c3957-d8db-419c-a398-a184ed4293f6");

        // Request Permission
        OneSignal.Notifications.requestPermission(true).then((accepted: boolean) => {
            console.log("User accepted notifications: " + accepted);
        });

        // Optional: Log when a notification is clicked
        OneSignal.Notifications.addEventListener('click', (event) => {
            console.log('OneSignal: notification clicked:', event);
        });

    } catch (error) {
        console.error("OneSignal Initialization Error:", error);
    }
};
