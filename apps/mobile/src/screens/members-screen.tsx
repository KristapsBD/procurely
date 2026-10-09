import type {
  CompanyMembership,
  InviteMemberRequest,
  Member,
  Role,
  UpdateMemberRequest,
} from '@procurely/shared-types';
import { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { ApiError } from '../api/client';
import {
  Button,
  ErrorNote,
  FormActions,
  Loading,
  TextField,
  styles,
} from '../components/ui';
import {
  useCompanyMutation,
  useMembers,
  useSignOutWhenUnauthorized,
  writeErrorMessage,
} from '../features/data';
import { canManageMembers } from '../features/permissions';
import { CompanyLine, WithActiveCompany } from './with-active-company';

const ROLES = ['REQUESTER', 'APPROVER', 'BUYER', 'ADMIN'] as const;

/**
 * GET /members does not refuse a non-admin: row-level security returns at most their own row.
 * A write does, with this message. The home button is only a convenience, so the screen says so.
 */
const ROLE_REFUSAL = 'Not allowed for your role in this company';

function roleLabel(role: Role): string {
  switch (role) {
    case 'REQUESTER':
      return 'Requester';
    case 'APPROVER':
      return 'Approver';
    case 'BUYER':
      return 'Buyer';
    case 'ADMIN':
      return 'Admin';
    default: {
      const unhandled: never = role;
      return unhandled;
    }
  }
}

/** The members of the company the person acts in. Admins manage them. */
export function MembersScreen() {
  return (
    <ScrollView contentContainerStyle={styles.screen}>
      <WithActiveCompany>
        {(active) =>
          canManageMembers(active.role) ? (
            // Keyed by company, so an open invite never survives a company switch.
            <Members key={active.companyId} company={active} />
          ) : (
            <MembersDenied key={active.companyId} company={active} />
          )
        }
      </WithActiveCompany>
    </ScrollView>
  );
}

function Members(props: { company: CompanyMembership }) {
  const { companyId } = props.company;
  const members = useMembers(companyId);
  const unauthorized = useSignOutWhenUnauthorized(members.error);
  const [adding, setAdding] = useState(false);
  return (
    <>
      <CompanyLine company={props.company} />
      <Text style={styles.body}>
        Inviting adds the person right away. No email is sent.
      </Text>
      {!adding && (
        <Button label="Invite member" onPress={() => setAdding(true)} />
      )}
      {adding && (
        <InviteForm companyId={companyId} onDone={() => setAdding(false)} />
      )}
      {members.isPending && <Loading label="Loading members" />}
      {members.isError && !unauthorized && (
        <ErrorNote
          message="Could not load members."
          onRetry={() => void members.refetch()}
        />
      )}
      {members.data && members.data.length === 0 && (
        <Text style={styles.body}>No members yet.</Text>
      )}
      {members.data?.map((m) => (
        <MemberCard key={m.id} companyId={companyId} member={m} />
      ))}
    </>
  );
}

function InviteForm(props: { companyId: string; onDone: () => void }) {
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<Role>('REQUESTER');
  const invite = useCompanyMutation(
    props.companyId,
    (api, token, body: InviteMemberRequest) =>
      api.inviteMember(token, props.companyId, body),
  );
  return (
    <View style={styles.card}>
      <TextField label="Email" value={email} onChangeText={setEmail} />
      <RoleChoice value={role} onChange={setRole} />
      <FormActions
        saveLabel="Invite"
        canSave={!invite.isPending && email.trim() !== ''}
        onSave={() =>
          invite.mutate(
            { email: email.trim(), role },
            { onSuccess: props.onDone },
          )
        }
        onCancel={props.onDone}
        error={invite.isError ? writeErrorMessage(invite.error) : null}
      />
    </View>
  );
}

function RoleChoice(props: {
  value: Role;
  onChange: (role: Role) => void;
  memberName?: string;
}) {
  return (
    <View style={{ gap: 4 }}>
      <Text style={styles.muted}>Role</Text>
      <View style={styles.row}>
        {ROLES.map((role) => (
          <Button
            key={role}
            label={roleLabel(role)}
            accessibilityLabel={
              props.memberName
                ? `Set ${props.memberName} to ${roleLabel(role)}`
                : `Role ${roleLabel(role)}`
            }
            selected={role === props.value}
            onPress={() => props.onChange(role)}
          />
        ))}
      </View>
    </View>
  );
}

function MemberCard(props: { companyId: string; member: Member }) {
  const { companyId, member } = props;
  const [changing, setChanging] = useState(false);
  const update = useCompanyMutation(
    companyId,
    (api, token, body: UpdateMemberRequest) =>
      api.updateMember(token, companyId, member.id, body),
  );
  const chooseRole = (role: Role) => {
    if (role === member.role) {
      setChanging(false);
      return;
    }
    update.mutate({ role }, { onSuccess: () => setChanging(false) });
  };
  return (
    <View style={styles.card}>
      <Text style={styles.body}>{member.name}</Text>
      <Text style={styles.muted}>{member.email}</Text>
      <Text style={styles.muted}>{`Role: ${roleLabel(member.role)}`}</Text>
      <Text style={styles.muted}>{member.active ? 'Active' : 'Inactive'}</Text>
      {changing && (
        <RoleChoice
          value={member.role}
          memberName={member.name}
          onChange={chooseRole}
        />
      )}
      <View style={styles.row}>
        {!changing && (
          <Button
            label="Change role"
            accessibilityLabel={`Change role of ${member.name}`}
            onPress={() => setChanging(true)}
          />
        )}
        <Button
          label={member.active ? 'Deactivate' : 'Reactivate'}
          accessibilityLabel={`${member.active ? 'Deactivate' : 'Reactivate'} ${member.name}`}
          disabled={update.isPending}
          onPress={() => update.mutate({ active: !member.active })}
        />
      </View>
      {update.isError && (
        <ErrorNote message={writeErrorMessage(update.error)} />
      )}
    </View>
  );
}

function MembersDenied(props: { company: CompanyMembership }) {
  const members = useMembers(props.company.companyId);
  const unauthorized = useSignOutWhenUnauthorized(members.error);
  if (unauthorized) return null;
  return (
    <>
      <CompanyLine company={props.company} />
      <DeniedBody
        pending={members.isPending}
        error={members.error}
        onRetry={() => void members.refetch()}
      />
    </>
  );
}

/** A client error is the API's own words. A successful list is still not the roster. */
function DeniedBody(props: {
  pending: boolean;
  error: unknown;
  onRetry: () => void;
}) {
  if (props.pending) return <Loading label="Loading members" />;
  const refused =
    props.error instanceof ApiError && props.error.status < 500
      ? props.error.message
      : null;
  if (props.error && !refused) {
    return (
      <ErrorNote message="Could not load members." onRetry={props.onRetry} />
    );
  }
  return <ErrorNote message={refused ?? ROLE_REFUSAL} />;
}
