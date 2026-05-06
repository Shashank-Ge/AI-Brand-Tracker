import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin"

export async function GET () {
    try {
        const snapshot = await adminDb
        .collection("visibility_results")
        .orderBy("createdAt", "desc")
        .limit(20)
        .get()

        // Group results by brand+category combination
        const grouped : Record<string,any>  = {}

        snapshot.docs.forEach( (doc) => {
            const data = doc.data() ;
            const key = `${data.brand}__${data.category}`;

            if (!grouped[key]) {
                grouped[key] = {
                    brand : data.brand,
                    category : data.category,
                    createdAt : data.createdAt?.toDate?.()?.toISOString() || null,
                    results: [],
                };
            }
            grouped[key].results.push(data);
        });

        // Calculate average score per group
        const history = Object.values(grouped).map((group:any) => {
            const avgScore = Math.round (
                group.results.reduce((sum: number , r: any) => sum + r.visibilityScore,0)/ group.results.length
            );
            const mentionCount = group.results.filter((r: any) => r.mentioned).length ;
            return {
                brand : group.brand,
                category : group.category,
                avgVisibilityScore : avgScore,
                mentionedIn : `${mentionCount} / ${group.results.length} prompts`,
                createdAt : group.createdAt ,
            };
        });
        return NextResponse.json({ history });

    } catch (err: any ) {
        console.error ("Hisotry fetch error: ", err) ;
        return NextResponse.json ({error :err.message} , {status:500});
    }
}