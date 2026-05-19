// Firebase Messaging SW는 push/notification 이벤트만 처리한다.
// fetch 가로채기는 불필요 + dev에서 fetch 실패 시 페이지 전체가 network error로 죽음.

importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: "AIzaSyA5n_pRANr2VBruHGUEBlyhA-UdEqMWHMM",
  authDomain: "samsan-ce3d3.firebaseapp.com",
  projectId: "samsan-ce3d3",
  storageBucket: "samsan-ce3d3.firebasestorage.app",
  messagingSenderId: "548885777439",
  appId: "1:548885777439:web:f42e196f29e8704243992a"
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  const title = payload.notification?.title ?? '새 배달';
  const body = payload.notification?.body ?? '';
  self.registration.showNotification(title, {
    body,
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    vibrate: [200, 100, 200],
  });
});
