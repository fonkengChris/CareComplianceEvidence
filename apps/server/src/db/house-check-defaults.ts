import type { CheckQuestion, CheckTemplateInput } from '@care/shared';

/**
 * The starting house-check templates, transcribed from the paper forms at the repo root
 * (Daily-Checks, Infection-Prevention, Room-Checks, Sharp-Checks, Weekly-Checks .docx). Wording
 * follows the forms with spelling/grammar tidied; "report it to the Management" lines become
 * `flagWhen`. Managers edit these in the app after seeding — this file only seeds.
 */

/** A yes/no question where the given answer needs reporting. */
function yn(
  id: string,
  text: string,
  flagWhen: 'YES' | 'NO',
  extra: Partial<CheckQuestion> = {},
): CheckQuestion {
  return { id, text, type: 'YES_NO', flagWhen, ...extra };
}

const damage = (id: string, text: string) =>
  yn(id, text, 'YES', {
    noteRequiredOnFlag: true,
    guidance: 'If YES, write down details of the damage and report it to the Management.',
  });

export const DEFAULT_CHECK_TEMPLATES: CheckTemplateInput[] = [
  {
    name: 'Daily Checks',
    scheduleKind: 'DAILY',
    scheduleDays: [],
    dueByTime: '12:00',
    definition: {
      sections: [
        {
          id: 'office',
          title: 'Staff office',
          questions: [
            {
              id: 'officeTemp',
              text: 'Is the temperature in the office a maximum of 24 degrees? Record the temperature.',
              type: 'YES_NO_NUMBER',
              unit: '°C',
              flagWhen: 'NO',
            },
            yn('bpMachine', 'Does the service have a blood pressure machine?', 'NO'),
            yn('thermometer', 'Does the service have a thermometer?', 'NO'),
            yn('scale', 'Does the service have a scale?', 'NO'),
            yn('grabBag', 'Is the fire grab bag in the designated place?', 'NO'),
            yn('firstAid', 'Is the first aid kit in the designated place?', 'NO'),
            yn('ligatureCutter', 'Is the ligature cutter in the designated place?', 'NO'),
            yn(
              'medCabinet',
              'Is the medication cabinet locked and the key held by the designated person?',
              'NO',
            ),
          ],
        },
        {
          id: 'kitchen',
          title: 'Kitchen and laundry room',
          questions: [
            {
              id: 'fridgeTemp',
              text: 'Has the fridge temperature been checked and recorded? Record the temperature.',
              type: 'YES_NO_NUMBER',
              unit: '°C',
              flagWhen: 'NO',
            },
            yn(
              'outOfDateFood',
              'Has any out of date food been disposed of from the fridge?',
              'NO',
              {
                allowNA: true,
              },
            ),
            yn('dryerLint', 'Has the dryer lint been cleaned?', 'NO'),
            yn('kitchenOdour', 'Do the kitchen and laundry room have a pleasant odour?', 'NO'),
          ],
        },
        {
          id: 'groundFloor',
          title: 'Ground floor',
          questions: [damage('damage', 'Any internal damage? (doors, handles, walls, floor)')],
        },
        {
          id: 'firstFloor',
          title: 'First floor',
          questions: [damage('damage', 'Any internal damage? (doors, handles, walls, floor)')],
        },
        {
          id: 'external',
          title: 'External building',
          questions: [damage('damage', 'Any external damage? (walls, door, windows)')],
        },
        {
          id: 'healthSafety',
          title: 'Health and Safety',
          questions: [
            yn('extinguisher', 'Is the fire extinguisher in place?', 'NO', {
              guidance: 'Report any damage to the Management.',
            }),
            yn('fireDoors', 'Are all the fire doors in working condition?', 'NO'),
            yn('emergencyLights', 'Are all the emergency lights in working condition?', 'NO'),
            yn('fireExits', 'Are the fire exits free from any obstruction?', 'NO'),
            yn('sanitiser', 'Is there enough hand sanitiser in each room?', 'NO'),
            yn('ppe', 'Is there enough PPE in stock? (masks, aprons, gloves)', 'NO'),
            yn(
              'cleaningSchedule',
              'Is there a cleaning schedule in place for the day shift and night shift?',
              'NO',
            ),
          ],
        },
      ],
    },
  },
  {
    name: 'Weekly Infection Prevention Audit',
    scheduleKind: 'WEEKLY',
    scheduleDays: ['MON'],
    dueByTime: null,
    definition: {
      sections: [
        {
          id: 'infection',
          questions: [
            yn('odour', 'Does the building have a pleasant odour?', 'NO'),
            yn('sanitiser', 'Is there any hand sanitiser in the communal areas?', 'NO'),
            yn('poster', 'Is there a hand washing hygiene procedure poster in the building?', 'NO'),
            yn(
              'handWashing',
              'Are the Service Users encouraged to wash their hands regularly?',
              'NO',
            ),
            yn('ppe', 'Is there enough PPE in stock? (gloves, aprons, masks)', 'NO', {
              guidance: 'If NO, report it to the Management.',
            }),
            {
              id: 'donning',
              text: 'Does the staff know the donning process (putting on PPE)? Write it down.',
              type: 'TEXT',
              guidance:
                'Wash hands with soap and water; wear the apron; wear face mask; wear gloves.',
            },
            {
              id: 'doffing',
              text: 'Does the staff know the doffing process (taking off PPE)? Write it down.',
              type: 'TEXT',
              guidance:
                'Remove gloves without touching the outside; wash hands; remove apron, folding downward from the neck; wash hands; remove mask without touching the front; wash hands.',
            },
            yn('coshhCupboard', 'Do you have a designated COSHH cupboard?', 'NO'),
            yn('coshhLocked', 'Is the COSHH cupboard locked all the time?', 'NO'),
            yn('cleaningSupply', 'Is there enough supply of cleaning materials?', 'NO'),
          ],
        },
      ],
    },
  },
  {
    name: 'Room Checks',
    scheduleKind: 'WEEKLY',
    scheduleDays: ['MON'],
    dueByTime: null,
    definition: {
      sections: [
        {
          id: 'rooms',
          repeat: { label: 'Room', defaultCount: 5, keyQuestionId: 'roomNumber' },
          questions: [
            { id: 'roomNumber', text: 'Room number', type: 'TEXT' },
            { id: 'occupied', text: 'Is the room occupied?', type: 'YES_NO' },
            {
              id: 'consent',
              text: 'If YES, did the Service User give you consent to check the room?',
              type: 'YES_NO',
              allowNA: true,
            },
            {
              id: 'noConsentReason',
              text: 'If the Service User did not give you consent to enter the room, write down the reason.',
              type: 'TEXT',
              optional: true,
            },
            yn(
              'damage',
              'Any damage to the room? (check the walls, flooring, door, window, furniture, bathroom)',
              'YES',
              { allowNA: true, noteRequiredOnFlag: true },
            ),
            yn('infectionControl', 'Are there any infection control issues?', 'YES', {
              allowNA: true,
              noteRequiredOnFlag: true,
            }),
            yn('drugsAlcohol', 'Can you smell any drugs or alcohol?', 'YES', {
              allowNA: true,
              guidance: 'If YES, report it to the Management.',
            }),
            yn('odour', 'Does the room have a pleasant odour?', 'NO', { allowNA: true }),
            yn('concerns', 'Any worries or concerns about the room?', 'YES', {
              allowNA: true,
              noteRequiredOnFlag: true,
              guidance: 'If YES, write it down and also report it to the Management.',
            }),
          ],
        },
      ],
    },
  },
  {
    name: 'Sharps Box Check',
    scheduleKind: 'DAILY',
    scheduleDays: [],
    dueByTime: null,
    definition: {
      sections: [
        {
          id: 'sharps',
          questions: [
            { id: 'knives', text: 'How many knives are in the box?', type: 'COUNT' },
            { id: 'tinOpeners', text: 'How many tin openers are in the box?', type: 'COUNT' },
            { id: 'graters', text: 'How many graters are in the box?', type: 'COUNT' },
            { id: 'pizzaCutters', text: 'How many pizza cutters are in the box?', type: 'COUNT' },
            { id: 'peelers', text: 'How many peelers are in the box?', type: 'COUNT' },
            { id: 'scissors', text: 'How many pairs of scissors are in the box?', type: 'COUNT' },
          ],
        },
      ],
    },
  },
  {
    name: 'Weekly Checks Audit',
    scheduleKind: 'WEEKLY',
    scheduleDays: ['MON'],
    dueByTime: null,
    definition: {
      sections: [
        {
          id: 'weekly',
          questions: [
            yn('fireAlarm', 'Has the fire alarm been tested? (go in each room and test it)', 'NO', {
              noteRequiredOnFlag: true,
              guidance:
                'If there is any issue, record it here and also report it to the Management ASAP.',
            }),
            yn('grabBag', 'Is the fire grab bag in the designated place?', 'NO'),
            yn('peeps', 'Are the PEEPs for all the Service Users in the bag?', 'NO'),
            yn('hiVis', 'Are high-vis vests available in the grab bag?', 'NO'),
            yn('headlight', 'Is an LED headlight available in the bag?', 'NO'),
            yn('glowSticks', 'Are safety glow sticks available in the bag?', 'NO'),
            yn(
              'marshal',
              'Are the Fire Marshal armband and Fire Warden hi-vis waistcoat available in the bag?',
              'NO',
            ),
            yn('firstAidPlace', 'Is the First Aid Kit in the designated place?', 'NO'),
            yn('firstAidComplete', 'Is the First Aid Kit complete?', 'NO', {
              guidance:
                'If some of the items are in low stock, talk to the Management for replacement.',
            }),
            yn('emergencyLights', 'Are the emergency lights in working order?', 'NO'),
            {
              id: 'coldWater',
              text: 'Is the cold water temperature under 20 degrees? Record it.',
              type: 'YES_NO_NUMBER',
              unit: '°C',
              flagWhen: 'NO',
            },
            {
              id: 'hotWater',
              text: 'Is the hot water temperature over 50 degrees? Record it.',
              type: 'YES_NO_NUMBER',
              unit: '°C',
              flagWhen: 'NO',
            },
          ],
        },
      ],
    },
  },
];
