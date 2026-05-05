import admin from "firebase-admin" ;
import { getFirestore } from "firebase-admin/firestore" ;
import serviceAccount from "../service-account.json" ;

if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount as admin.ServiceAccount),
    }) ;
}

export const adminDb = getFirestore() ;
