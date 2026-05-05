-- =============================================================
-- 0005. 원장님 자기소개 (intro) 채우기
-- 정적 사이트 DOCTORS 정의에서 그대로 이식.
-- =============================================================

update public.doctors set intro =
  E'한 분 한 분의 피부를 깊이 이해하고\n피부 건강을 끝까지 책임지는\n힐링 닥터가 되겠습니다.'
  where slug = 'kwonsuhyun';

update public.doctors set intro =
  E'건강한 피부를 넘어\n삶의 긍정적인 변화까지 드리는\n피부 주치의가 되겠습니다.'
  where slug = 'kimsoohyung';

update public.doctors set intro =
  E'피부 건강과 아름다움은 물론\n마음까지 치유될 수 있도록\n정성껏 진료하겠습니다.'
  where slug = 'parkhyojin';

update public.doctors set intro =
  E'한 분 한 분의 피부를\n한 폭의 캔버스라 여기며\n고유한 아름다움을 찾아드리겠습니다.'
  where slug = 'leedoyoung';

update public.doctors set intro =
  E'한 번 시술 후 잊히는 의사가 아닌\n피부의 모든 것을 믿고 맡길 수 있는\n평생 피부 주치의가 되겠습니다.'
  where slug = 'jeonghanmi';

update public.doctors set intro =
  E'자신감 넘치는 피부로\n환자분의 삶이 더 당당히 빛나도록\n늘 곁에서 노력하겠습니다.'
  where slug = 'gohyerim';

update public.doctors set intro =
  E'피부 고민에 깊이 공감하고\n충분한 소통을 바탕으로\n개인별 맞춤 솔루션을 제시하겠습니다.'
  where slug = 'kimjongsik';

update public.doctors set intro =
  E'진심 어린 치료와 꾸준한 연구로\n백반증으로 고통받는 환자분들의\n영원한 동반자가 되겠습니다.'
  where slug = 'baejungmin';

update public.doctors set intro =
  E'면밀한 상담과 끊임없는 연구로\n환자분 한 분 한 분께\n가장 알맞은 치료를 찾아드리겠습니다.'
  where slug = 'kanghyunjin';
