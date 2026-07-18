-- 0358_doctor_papers_metadata.sql
-- 원장 대표 논문: profile_data.pmids(PMID만) -> papers(pmid+title+journal+year) 승격.
-- 제목/저널/연도는 PubMed esummary 정규값(2026-07-18). 다른 profile_data 필드는 보존.
-- 코드 SSOT: src/lib/doctor-profile.ts DoctorPaper / getDoctorPapers.

UPDATE public.doctors
SET profile_data = (profile_data - 'pmids') || jsonb_build_object('papers', '[{"pmid":"28355423","title":"Phototherapy for Vitiligo: A Systematic Review and Meta-analysis","journal":"JAMA Dermatol","year":2017},{"pmid":"30342161","title":"Antioxidant supplements in combination with phototherapy for vitiligo: A systematic review and meta-analysis of randomized controlled trials","journal":"J Am Acad Dermatol","year":2021}]'::jsonb)
WHERE slug = 'jung-hanmi';

UPDATE public.doctors
SET profile_data = (profile_data - 'pmids') || jsonb_build_object('papers', '[{"pmid":"41345471","title":"Vitiligo","journal":"Nat Rev Dis Primers","year":2025},{"pmid":"30785828","title":"Markedly Reduced Risk of Internal Malignancies in Patients With Vitiligo: A Nationwide Population-Based Cohort Study","journal":"J Clin Oncol","year":2019},{"pmid":"41879771","title":"Definition of Severity and Relapse for Vitiligo: An International Consensus Statement","journal":"JAMA Dermatol","year":2026}]'::jsonb)
WHERE slug = 'bae-jungmin';

UPDATE public.doctors
SET profile_data = (profile_data - 'pmids') || jsonb_build_object('papers', '[{"pmid":"30279727","title":"Senescent fibroblasts drive ageing pigmentation: A potential therapeutic target for senile lentigo","journal":"Theranostics","year":2018},{"pmid":"30575141","title":"Senescent fibroblasts in melasma pathophysiology","journal":"Exp Dermatol","year":2019},{"pmid":"32171812","title":"Suberythemic and erythemic doses of a 308-nm excimer laser treatment of stable vitiligo in combination with topical tacrolimus: A randomized controlled trial","journal":"J Am Acad Dermatol","year":2020}]'::jsonb)
WHERE slug = 'kwon-soohyun';

UPDATE public.doctors
SET profile_data = (profile_data - 'pmids') || jsonb_build_object('papers', '[{"pmid":"25324675","title":"Injection-site reaction following 5-azacitidine injection","journal":"Ann Dermatol","year":2014},{"pmid":"25468572","title":"A frameshift mutation in the ADAR gene in a Korean family with dyschromatosis symmetrica hereditaria","journal":"Eur J Dermatol","year":2014},{"pmid":"23368686","title":"Combination therapy using fractional micro-plasma radio-frequency treatment followed by a drug delivery system with a sonotrode in Korean patients","journal":"J Cosmet Laser Ther","year":2013}]'::jsonb)
WHERE slug = 'ko-hyerim';

UPDATE public.doctors
SET profile_data = (profile_data - 'pmids') || jsonb_build_object('papers', '[{"pmid":"33595599","title":"Surgical Interventions for Patients With Vitiligo: A Systematic Review and Meta-analysis","journal":"JAMA Dermatol","year":2021},{"pmid":"32745343","title":"Excimer laser/light treatment of alopecia areata: A systematic review and meta-analyses","journal":"Photodermatol Photoimmunol Photomed","year":2020}]'::jsonb)
WHERE slug = 'kim-soohyung';

UPDATE public.doctors
SET profile_data = (profile_data - 'pmids') || jsonb_build_object('papers', '[{"pmid":"29107338","title":"Prevalence and clinicopathologic characteristics of multiple myeloma with cutaneous involvement: A case series from Korea","journal":"J Am Acad Dermatol","year":2018},{"pmid":"30260493","title":"Effect of ingenol mebutate on actinic keratosis in a Korean population: A prospective clinical, dermoscopic and histopathological study from a single center","journal":"J Dermatol","year":2018},{"pmid":"27483258","title":"Molecular Mechanisms of Cutaneous Inflammatory Disorder: Atopic Dermatitis","journal":"Int J Mol Sci","year":2016}]'::jsonb)
WHERE slug = 'kim-jongsic';

UPDATE public.doctors
SET profile_data = (profile_data - 'pmids') || jsonb_build_object('papers', '[{"pmid":"37759497","title":"High-Intensity Focused Ultrasound Increases Collagen and Elastin Fiber Synthesis by Modulating Caveolin-1 in Aging Skin","journal":"Cells","year":2023},{"pmid":"41532837","title":"A Split Face Study Comparing the Effect of a PDLLA Based Product and PLLA on the Nasolabial Fold (NLF)","journal":"Skin Res Technol","year":2026},{"pmid":"23789873","title":"Efficacy and safety of a new monophasic hyaluronic acid filler in the correction of nasolabial folds: a randomized, evaluator-blinded, split-face study","journal":"J Dermatolog Treat","year":2014}]'::jsonb)
WHERE slug = 'rhee-doyoung';

UPDATE public.doctors
SET profile_data = (profile_data - 'pmids') || jsonb_build_object('papers', '[{"pmid":"34858013","title":"Abrupt Development of Esophageal Candidiasis after Secukinumab Treatment in a Psoriatic Patient","journal":"Ann Dermatol","year":2021},{"pmid":"34079190","title":"Recurrent Cellulitis Associated with Acupuncture with Migratory Gold Threads","journal":"Ann Dermatol","year":2021},{"pmid":"35948333","title":"A Case of Linear Exacerbation of Atopic Dermatitis with Secondary Prurigo Nodularis","journal":"Ann Dermatol","year":2022}]'::jsonb)
WHERE slug = 'kang-hyunjin';

UPDATE public.doctors
SET profile_data = (profile_data - 'pmids') || jsonb_build_object('papers', '[{"pmid":"35721337","title":"Comparison of Th1 and Th17 Inflammatory Cytokine Profiles Between Chronic Plaque and Acute Guttate Psoriasis","journal":"Ann Dermatol","year":2022},{"pmid":"37853865","title":"A Rare Case of Juvenile Gangrenous Vasculitis of the Scrotum in Korea","journal":"Ann Dermatol","year":2023},{"pmid":"36198635","title":"A Case of Seborrheic Keratosis on the Volar Side of the Fingers after Skin Graft","journal":"Ann Dermatol","year":2022}]'::jsonb)
WHERE slug = 'park-hyojin';

