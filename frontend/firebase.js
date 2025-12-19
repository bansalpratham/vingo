import { initializeApp } from "firebase/app";
import {getAuth} from "firebase/auth";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_APIKEY,
  authDomain: "vingo-food-delivery-8c3e3.firebaseapp.com",
  projectId: "vingo-food-delivery-8c3e3",
  storageBucket: "vingo-food-delivery-8c3e3.firebasestorage.app",
  messagingSenderId: "1048745963830",
  appId: "1:1048745963830:web:06d22c8a1d942b3f6c8397"
};

const app = initializeApp(firebaseConfig);

const auth = getAuth(app)

export {app,auth} 