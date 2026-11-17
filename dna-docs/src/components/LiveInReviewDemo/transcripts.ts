// The review transcripts from evals/20260620/dataset/transcripts, streamed
// by the in-review demo's transcript feed. Cycled in this order, one per
// version that's set in review.

export interface TranscriptLine {
  speaker: string;
  text: string;
}

export interface Transcript {
  shot: string;
  lines: TranscriptLine[];
}

export const TRANSCRIPTS: Transcript[] = [
  {
    shot: 'TST_010_0010',
    lines: [
      {
        speaker: 'Dennis',
        text: 'Hi, how are we? Good morning.',
      },
      {
        speaker: 'Ken',
        text: 'Morning, good night, who knows!',
      },
      {
        speaker: 'Phil',
        text: 'Haha.',
      },
      {
        speaker: 'John',
        text: 'Let\'s get into it.',
      },
      {
        speaker: 'Dennis',
        text: 'Okay, well to start, this is looking a little blown out. I like how far the sails have come along, the sim is looking really good, but let\'s go ahead and knock the sky down a few stops and bring in a bit more detail. That would be good.',
      },
      {
        speaker: 'Ken',
        text: 'Ok, sounds good Dennis, is there anything you\'d like us to do with the flare? Keep it? Nix it?',
      },
      {
        speaker: 'John',
        text: 'For the record, we\'re not married to it.',
      },
      {
        speaker: 'Dennis',
        text: 'Nope yeah, I think we can lose it. It\'s drawing the eye and I\'m really trying to focus on the sails here.',
      },
      {
        speaker: 'Phil',
        text: 'Mountains good? Happy with the scenery?',
      },
      {
        speaker: 'Dennis',
        text: 'Yep, all good there. That\'s about all I had.',
      },
      {
        speaker: 'John',
        text: 'Nice, we\'ll take a look.',
      },
      {
        speaker: 'Ken',
        text: 'Yep thanks, let\'s move on.',
      },
      {
        speaker: 'Dennis',
        text: 'Oh wait, sorry, let\'s also just get a little bit more sand dust kicking up down around screen right. Would like a little more movement on the desert there.',
      },
      {
        speaker: 'Ken',
        text: 'Yep.',
      },
      {
        speaker: 'Dennis',
        text: 'Something to show the air isn\'t still, give the Carryall something to fly on.',
      },
      {
        speaker: 'Ken',
        text: 'Yep, yep, okay we\'ll take a look.',
      },
      {
        speaker: 'Phil',
        text: 'alright, next one.',
      },
    ],
  },
  {
    shot: 'TST_010_0020',
    lines: [
      {
        speaker: 'Ken',
        text: 'This guy\'s still a bit of a WIP.',
      },
      {
        speaker: 'Phil',
        text: 'Yeah, Dennis, John\'s done a great job here, but we wanted to get this over so you could take a look before we went any further with it.',
      },
      {
        speaker: 'John',
        text: 'It\'s a bit more than a first pass, but we wanted to gauge feelings about the visibility of the surroundings.',
      },
      {
        speaker: 'Dennis',
        text: 'Yeah, reading the submission notes here, I think we\'re looking good. We want there to be visibility, so we know there\'s stuff around there, but want to hold onto that infinity feeling. Don\'t want to see the edges of the room at all.',
      },
      {
        speaker: 'Ken',
        text: 'Right right.',
      },
      {
        speaker: 'Dennis',
        text: 'I think you\'re on the right track, I had some other things I wanted to address though. The two digi\'s are looking a little static. If we can get just a little bit of movement. Let\'s have them walk into their current position.',
      },
      {
        speaker: 'Phil',
        text: 'Ah, okay, that\'s going to involve some more animation.',
      },
      {
        speaker: 'Ken',
        text: 'Not a problem, Dennis, makes sense.',
      },
      {
        speaker: 'Dennis',
        text: 'Also, I think we can lose the highlights on the top of the throne. Should look almost like an alien material, where all light gets lost.',
      },
      {
        speaker: 'Ken',
        text: 'You got it, thanks we\'re on it.',
      },
    ],
  },
  {
    shot: 'TST_010_0030',
    lines: [
      {
        speaker: 'Dennis',
        text: 'Okay so here, we need to kill this middle tree. That\'s bumping with George.',
      },
      {
        speaker: 'Ken',
        text: 'Don\'t want to see it?',
      },
      {
        speaker: 'Dennis',
        text: 'No that\'s gotta go, need to be able to read the prisoners.',
      },
      {
        speaker: 'Ken',
        text: 'You got it.',
      },
      {
        speaker: 'Dennis',
        text: 'We\'re also going to want to lose the smoke a bit, they like the brightness of the fire, but it\'s the bloom that\'s a bit much.',
      },
      {
        speaker: 'Ken',
        text: 'Okay. How are we feeling about the ones in the back there?',
      },
      {
        speaker: 'Dennis',
        text: 'Fine, it\'s really just the foreground trees, and wanting to read what\'s going on on the ground.',
      },
      {
        speaker: 'Phil',
        text: 'This guard here on the left at the end, I know we had a few conversations about his helmet. Are we happy with what we\'re looking at now?',
      },
      {
        speaker: 'Dennis',
        text: 'Yeah, that\'s looking a lot better, thanks again for taking another pass at that.',
      },
      {
        speaker: 'Ken',
        text: 'Yup. Alright, all good here?',
      },
      {
        speaker: 'Dennis',
        text: 'Yep.',
      },
    ],
  },
  {
    shot: 'TST_010_0040',
    lines: [
      {
        speaker: 'Ken',
        text: 'Harvester shadow...',
      },
      {
        speaker: 'Dennis',
        text: 'Yep, that\'s looking fine, they want to rack focus now to the Ornothopter.',
      },
      {
        speaker: 'Ken',
        text: 'Okay.',
      },
      {
        speaker: 'Dennis',
        text: 'Not immediately, so, um, leave a little room for it to come into frame, and just as it crosses in front of the harvester, that\'s when we want to make the switch.',
      },
      {
        speaker: 'Ken',
        text: 'Yep, I see, okay.',
      },
      {
        speaker: 'Phil',
        text: 'Dennis, are we liking the movement? We had talked about the blades.',
      },
      {
        speaker: 'Dennis',
        text: 'Yep, blades looking much better, like the trajectory here. Let\'s do the rack, and we should be able to put this one to bed.',
      },
      {
        speaker: 'Ken',
        text: 'Great.',
      },
      {
        speaker: 'Phil',
        text: 'Thanks Dennis.',
      },
      {
        speaker: 'John',
        text: 'Dennis, just briefly, on the rack there, are we thinking a quick pull? What are we looking for there?',
      },
      {
        speaker: 'Dennis',
        text: 'No more than 10 frames I\'ve been told, they are looking for it to be quick, it out paces the shot, but it\'s what they\'re looking for.',
      },
      {
        speaker: 'John',
        text: 'Okay, yep.',
      },
      {
        speaker: 'Ken',
        text: 'Yep, great',
      },
      {
        speaker: 'Phil',
        text: 'Thanks, it\'s been a fun one Dennis.',
      },
      {
        speaker: 'Dennis',
        text: 'I\'m glad.',
      },
    ],
  },
  {
    shot: 'TST_020_0010',
    lines: [
      {
        speaker: 'Ken',
        text: 'Bulb glow...',
      },
      {
        speaker: 'Dennis',
        text: 'Yep, much better.',
      },
      {
        speaker: 'Ken',
        text: 'Happy with the movement?',
      },
      {
        speaker: 'Dennis',
        text: 'Yes, we can push this through, call it good to go.',
      },
      {
        speaker: 'Ken',
        text: 'Alright, great news. We\'ll push it through to tech check.',
      },
    ],
  },
  {
    shot: 'TST_020_0020',
    lines: [
      {
        speaker: 'Dennis',
        text: 'Okay, on this one we\'re going to need a lot more detail on the desert. I know the suns getting low, but if we can get some more contrast in there, I think we\'d see things a lot better. Should read the dunes more, and get the sense of depth. Whole thing is looking kind of one dimensional.',
      },
      {
        speaker: 'Ken',
        text: 'Yep, alright. Sun set feeling good? Colors?',
      },
      {
        speaker: 'Dennis',
        text: 'Yes, looking great, I think we should dial back our haze though, this isn\'t cutting right with the surrounding shots. Needs to look a bit more beautiful here, less apocalyptic.',
      },
      {
        speaker: 'Ken',
        text: 'Alright, sounds good, we\'ll take a look.',
      },
    ],
  },
  {
    shot: 'TST_020_0030',
    lines: [
      {
        speaker: 'Ken',
        text: 'Smoke plumes...',
      },
      {
        speaker: 'Dennis',
        text: 'They like this. Really looking a lot better. I told them we weren\'t sure if it was too much on the smoke, but they said they loved it so we\'re looking good there.',
      },
      {
        speaker: 'Ken',
        text: 'Great, that\'s awesome to hear.',
      },
      {
        speaker: 'Dennis',
        text: 'Small thing here, they do want to nudge the cruiser on the right there over with the smaller ships as well. Basically want to bright in left so we can see the whole cruiser.',
      },
      {
        speaker: 'Ken',
        text: 'Ah, missing the rest of it there, I see.',
      },
      {
        speaker: 'Phil',
        text: 'Yep, makes sense, we can take a pass at that.',
      },
      {
        speaker: 'Dennis',
        text: 'Thanks, I think that should get us the rest of the way on this one.',
      },
      {
        speaker: 'Ken',
        text: 'Brilliant, thanks, yeah this one we were happy to work on Dennis, glad this is getting closer.',
      },
      {
        speaker: 'Dennis',
        text: 'Alright, yeah happy to see it.',
      },
      {
        speaker: 'Ken',
        text: 'Nice, um, so...',
      },
      {
        speaker: 'Phil',
        text: 'Think that\'s all she wrote guys...',
      },
      {
        speaker: 'John',
        text: 'Alright! Anything else here Dennis?',
      },
      {
        speaker: 'Dennis',
        text: 'That\'s it? Wow we\'re getting closer here. Nope, happy to see things coming along.',
      },
      {
        speaker: 'Ken',
        text: 'Alrighty, talk soon, we\'ll be in touch.',
      },
      {
        speaker: 'Dennis',
        text: 'yep, thanks everyone.',
      },
      {
        speaker: 'John',
        text: 'Bye.',
      },
      {
        speaker: 'Dennis',
        text: 'See ya.',
      },
      {
        speaker: 'Ken',
        text: 'Bye.',
      },
    ],
  },
];
