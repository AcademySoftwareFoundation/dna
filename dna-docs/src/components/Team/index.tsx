import type {ReactNode} from 'react';
import useBaseUrl from '@docusaurus/useBaseUrl';
import styles from './styles.module.css';

type Member = {
  name: string;
  org: string;
  /** File name under static/img/team. */
  photo: string;
};

const Members: Member[] = [
  {name: 'Tommy Burnette', org: 'Industrial Light & Magic', photo: 'tommy-burnette.jpg'},
  {name: 'Cottalango Leon', org: 'Sony Pictures Imageworks', photo: 'cottalango-leon.jpg'},
  {name: 'James Spadafora', org: 'Industrial Light & Magic', photo: 'james-spadafora.jpg'},
  {name: 'Cameron Target', org: 'Disney (Moana)', photo: 'cameron-target.jpg'},
  {name: 'Olga Avramenko', org: 'Sony Pictures Imageworks', photo: 'olga-avramenko.jpg'},
  {name: 'Tommy Snyder', org: 'Autodesk', photo: 'tommy-snyder.jpg'},
  {name: 'Dmitry Grankin', org: 'Vexa A.I.', photo: 'dmitry-grankin.jpg'},
  {name: 'Sam Richards', org: 'Disney Imagineer', photo: 'sam-richards.jpg'},
];

function Portrait({name, org, photo}: Member) {
  return (
    <li className={styles.member}>
      <img className={styles.photo} src={useBaseUrl(`img/team/${photo}`)} alt="" loading="lazy" />
      <span className={styles.name}>{name}</span>
      <span className={styles.org}>{org}</span>
    </li>
  );
}

/** The people behind DNA, as a grid of portraits. Used on the About page. */
export default function Team(): ReactNode {
  return (
    <ul className={styles.team}>
      {Members.map((member) => (
        <Portrait key={member.name} {...member} />
      ))}
    </ul>
  );
}
