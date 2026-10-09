import type { Requisition } from '@procurely/shared-types';
import { useState } from 'react';
import { View } from 'react-native';
import { Button, ErrorNote, TextField } from '../components/ui';
import { useCompanyMutation, writeErrorMessage } from '../features/data';

type Decision =
  { action: 'approve'; comment: string } | { action: 'reject'; reason: string };

/**
 * Approve with an optional comment, or reject with a required reason, as far as the API offers
 * either. Both texts are shown to the requester.
 */
export function DecisionPanel(props: {
  companyId: string;
  requisition: Requisition;
  title: string;
  onDecided?: (decided: Requisition) => void;
}) {
  const { companyId, requisition: r, title } = props;
  const [comment, setComment] = useState('');
  const [reason, setReason] = useState('');
  const decide = useCompanyMutation(companyId, (api, token, d: Decision) =>
    d.action === 'approve'
      ? api.approveRequisition(token, companyId, r.id, {
          comment: d.comment.trim() || undefined,
        })
      : api.rejectRequisition(token, companyId, r.id, {
          reason: d.reason.trim(),
        }),
  );
  const onSuccess = props.onDecided;
  return (
    <View style={{ gap: 8 }}>
      {r.actions.includes('approve') && (
        <>
          <TextField
            label={`Comment on ${title} (optional)`}
            value={comment}
            onChangeText={setComment}
          />
          <Button
            label="Approve"
            accessibilityLabel={`Approve ${title}`}
            disabled={decide.isPending}
            onPress={() =>
              decide.mutate({ action: 'approve', comment }, { onSuccess })
            }
          />
        </>
      )}
      {r.actions.includes('reject') && (
        <>
          <TextField
            label={`Reason for rejecting ${title}`}
            value={reason}
            onChangeText={setReason}
          />
          <Button
            label="Reject"
            accessibilityLabel={`Reject ${title}`}
            disabled={decide.isPending || reason.trim() === ''}
            onPress={() =>
              decide.mutate({ action: 'reject', reason }, { onSuccess })
            }
          />
        </>
      )}
      {decide.isError && (
        <ErrorNote message={writeErrorMessage(decide.error)} />
      )}
    </View>
  );
}
