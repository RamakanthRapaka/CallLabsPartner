import React from 'react'
import { Text, View } from 'react-native'
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons'
import type { AssignmentOrder, CollectionTest } from '../api/types'
import { collectionEntries, collectionFasting, instructionText } from '../utils/collectionTests'
import { Badge, s } from './ui'

export function FastingBadge({ value, packageLevel = false }: { value?: boolean | null; packageLevel?: boolean }) {
  const required = value === true, known = required || value === false
  const label = `${packageLevel ? 'Package fasting' : 'Fasting'} ${required ? 'required' : known ? 'not required' : 'not provided'}`
  const color = required ? '#854D0E' : known ? '#166534' : '#475569'
  return <View accessible accessibilityLabel={label} style={{ flexDirection: 'row', alignItems: 'center', gap: 7, alignSelf: 'flex-start', backgroundColor: required ? '#FEF3C7' : known ? '#DCFCE7' : '#F1F5F9', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 7, maxWidth: '100%' }}>
    {required ? <MaterialCommunityIcons name="food-off" size={18} color={color} accessible={false} /> : <Feather name={known ? 'check-circle' : 'help-circle'} size={17} color={color} accessible={false} />}
    <Text style={{ color, fontSize: 12, fontWeight: '700', flexShrink: 1 }}>{label}</Text>
  </View>
}

export function CollectionTestsPreview({ order }: { order: AssignmentOrder }) {
  const entries = collectionEntries(order)
  return <View style={{ gap: 4 }}><Text style={s.label}>Tests / packages</Text>
    {entries.length ? entries.slice(0, 3).map(entry => <Text key={entry.key} style={s.text}>• {entry.label}</Text>) : <Text style={s.muted}>Test/package names not provided.</Text>}
    {entries.length > 3 ? <Text style={s.muted}>+{entries.length - 3} more — open View collection for all items.</Text> : null}
    <FastingBadge value={collectionFasting(order)} />
  </View>
}
function TestInstructions({ test }: { test?: CollectionTest }) {
  return <>
    <Text style={s.text}>Tube requirements: {instructionText(test?.tube_requirements)}</Text>
    <FastingBadge value={test?.fasting_required} />
    {test?.fasting_instructions?.trim() ? <Text style={s.text}>Fasting instructions: {test.fasting_instructions}</Text> : null}
    <Text style={s.text}>Collection instructions: {instructionText(test?.collection_instructions)}</Text>
  </>
}
export function CollectionTestsDetails({ order }: { order: AssignmentOrder }) {
  const entries = collectionEntries(order)
  return <View style={{ gap: 10 }}><Text style={s.title}>Tests / packages</Text>
    <Text style={s.muted}>Use instructions supplied by the assigned laboratory. Missing details must be confirmed with the laboratory before collection.</Text>
    {!entries.length ? <Text style={s.text}>No test/package names were supplied for this booking. Ask your administrator to verify its contents.</Text> : null}
    {entries.map(entry => <View key={entry.key} style={s.card}>
      <Text style={s.title}>{entry.label}</Text>
      {entry.kind !== 'unknown' ? <Badge label={entry.kind === 'package' ? 'Package' : 'Test'} /> : null}
      {entry.package ? <>
        <FastingBadge value={entry.package.fasting_required} packageLevel />
        {entry.package.fasting_instructions?.trim() ? <Text style={s.text}>Fasting instructions: {entry.package.fasting_instructions}</Text> : null}
        <Text style={s.text}>Collection instructions: {instructionText(entry.package.collection_instructions)}</Text>
        <Text style={s.title}>Included tests</Text>
        {entry.package.tests?.length ? entry.package.tests.map((test, index) => <View key={`${test.id}-${index}`} style={{ gap: 5, paddingTop: 8 }}><Text style={s.title}>{test.name}</Text><TestInstructions test={test} /></View>) : <Text style={s.muted}>Included tests not provided — confirm with laboratory.</Text>}
      </> : <TestInstructions test={entry.test} />}
    </View>)}
  </View>
}
