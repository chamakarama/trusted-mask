import type {Direction} from './model';
export const DAY_RELEASE='kupittaa-day-v2';
export const DAY_MOMENTS:Record<string,{area:string;direction:Direction;title:string}>={
 '00-06':{area:'TRK-G13',direction:'starts',title:'Afterparty → home'},
 '06-09':{area:'TRK-G14',direction:'destinations',title:'Hackathon arrivals'},
 '09-15':{area:'TRK-G12',direction:'destinations',title:'Lunch break'},
 '15-18':{area:'TRK-G14',direction:'starts',title:'Leaving the hackathon'},
 '18-24':{area:'TRK-G08',direction:'destinations',title:'The Alko run'},
};
export const DAY_LABELS:Record<string,string>={'TRK-G14':'Kupittaa','TRK-G12':'Lunch area','TRK-G08':'Alko run','TRK-G09':'Food stop','TRK-G13':'Afterparty'};
