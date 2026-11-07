import json
p='mask/ml/privacy_v1/annotation/shards/777b624ec45a40d086a880b5f15cdcd0/resolved-03.jsonl'
out='mask/ml/privacy_v1/annotation/shards/636360bb8a544d9ea79023c117ea6d03/blind-02.jsonl'
data={
'cough-a':('Alias Nkiru; drop unrelated rent; retain permitted health','dry cough since Tuesday at night, no fever; wheezing timing uncertain before filter change; no inferred cause'),
'cough-b':('Drop unnecessary sensitive health and protect Nkiru if retained; retain rent','815 euros monthly rent'),
' tickets-a':('',''),
' tickets-b':('',''),
'garden-a':('Protect card; rest benign','four hours sun, three planters, watering exception, herbs and salad leaves'),
'kettle-a':('Protect email','two-week failure, light on but cold water, receipt, replacement preference, ask required proof'),
'budget-a':('Financial facts permitted and needed','approximate income, bills, estimated groceries, missing expenses, remainder not guaranteed savings'),
'reading-a':('No core private spans','240 pages, five evenings, 30 minutes, questions, no marking, unknown speed'),
'packing-a':('No core private spans','four days, two rainy days, washing once, walking, check liquid limits without assuming'),
'soup-a':('No core private spans','original serves four, quantities, target six, gradual salt, no dairy'),
'lunch-a':('Alias Youssef','father brings vegetarian main only if confirmation by Friday; salad, allergies, eight expected with two unconfirmed'),
'bicycle-a':('No core private spans','features and uncertainty for both bicycles, questions not confident assessments'),
'sales-a':('Alias Amina; protect private client Juniper Forge and unapproved price','two-week onboarding outline, named contact request, no launch date promise; limitations from masking'),
'sales-b':('Protect client and unapproved price despite task relevance, alias Amina if retained','exact comparison unavailable after price protection; disclose limitation'),
'logs-a':('Protect password','403 after connection, permission denied, previously worked before config change, cause uncertain'),
'support-a':('Alias Leila; protect email and account reference','export stops at 90%, no file, retry once, ask failure time, not reproduced, no claim data lost'),
'hiring-a':('Drop unrelated confidential employee, salary, health section','clear technical communication, design collaboration, remote within country'),
'publicapp-a':('No core private spans','events, reminders, weekly schedule, reminders can be disabled, no integration promise'),
'budget-b':('Financial facts plausibly useful and permitted with uncertain relevance','estimated income and groceries, fixed bills, missing travel and irregulars, remainder not guaranteed'),
}
data['tickets-a']=('Alias Darya if retained; drop unrelated health','64 euros refundable until day before departure; 41 euros nonrefundable')
data['tickets-b']=('Alias Darya; health potentially relevant for vague organisation task, uncertain relevance and permitted KEEP possible','ticket options and refund conditions, sister offer conditional on shift, migraines twice monthly potentially relevant')
data['tap-a']=('Protect phone','drips roughly a week, worsens when closed, bowl, no dismantling, appointment, no blame')
with open(out,'x') as f:
 for r in map(json.loads,open(p)):
  key=r['id'].split(':')[-1]; privacy, deps=data[key]
  f.write(json.dumps({'record_id':r['id'],'private_spans_and_treatment':privacy,'answer_dependencies':deps},ensure_ascii=False)+'\n')
