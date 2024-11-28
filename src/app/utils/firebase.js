import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
    apiKey: "AIzaSyBshOEPaoUB0cXbKPoGHzX8Wa9ZRImJGQ4",
    authDomain: "coachcareai.firebaseapp.com",
    projectId: "coachcareai",
    storageBucket: "coachcareai.appspot.com",
    messagingSenderId: "661748615150",
    appId: "1:661748615150:web:82bdd52b90a28f26b3f0ff"
  };


const app = initializeApp(firebaseConfig);
const firestore = getFirestore(app); 

export { app, firestore };