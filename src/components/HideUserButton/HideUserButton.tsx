import { Button, ButtonProps, Menu } from '@mantine/core';
import { IconEye, IconEyeOff } from '@tabler/icons';
import { MouseEventHandler } from 'react';
import { LoginRedirect } from '~/components/LoginRedirect/LoginRedirect';

import { useCurrentUser } from '~/hooks/useCurrentUser';
import { showSuccessNotification } from '~/utils/notifications';
import { trpc } from '~/utils/trpc';

export function HideUserButton({ userId, as = 'button', onToggleHide, ...props }: Props) {
  const currentUser = useCurrentUser();
  const queryUtils = trpc.useContext();

  const { data: hidden = [] } = trpc.user.getHiddenUsers.useQuery(undefined, {
    enabled: !!currentUser,
  });
  const alreadyHiding = hidden.map((user) => user.id).includes(userId);

  const toggleHideMutation = trpc.user.toggleHide.useMutation({
    async onMutate() {
      await queryUtils.user.getHiddenUsers.cancel();

      const prevHidden = queryUtils.user.getHiddenUsers.getData();

      queryUtils.user.getHiddenUsers.setData(undefined, (old = []) =>
        alreadyHiding
          ? old.filter((item) => item.id !== userId)
          : [...old, { id: userId, username: null, image: null, name: null }]
      );

      return { prevHidden };
    },
    onSuccess() {
      showSuccessNotification({
        title: `User marked as ${alreadyHiding ? 'show' : 'hidden'}`,
        message: `Content from this user will${alreadyHiding ? ' ' : ' not'} show up in your feed`,
      });
    },
    onError(_error, _variables, context) {
      queryUtils.user.getHiddenUsers.setData(undefined, context?.prevHidden);
    },
    async onSettled() {
      await queryUtils.user.getHiddenUsers.invalidate();
      await queryUtils.user.getCreator.invalidate();
      await queryUtils.user.getLists.invalidate();
    },
  });
  const handleHideClick: MouseEventHandler<HTMLElement> = (e) => {
    e.preventDefault();
    e.stopPropagation();
    toggleHideMutation.mutate({ targetUserId: userId });
    onToggleHide?.();
  };

  if (userId === currentUser?.id) return null;

  return as === 'button' ? (
    <LoginRedirect reason="hide-user">
      <Button
        variant={alreadyHiding ? 'outline' : 'filled'}
        onClick={handleHideClick}
        loading={toggleHideMutation.isLoading}
        {...props}
      >
        {alreadyHiding ? 'Unhide' : 'Hide'}
      </Button>
    </LoginRedirect>
  ) : (
    <Menu.Item
      onClick={handleHideClick}
      icon={
        alreadyHiding ? <IconEye size={16} stroke={1.5} /> : <IconEyeOff size={16} stroke={1.5} />
      }
    >
      {alreadyHiding ? 'Unhide ' : 'Hide '}content from this user
    </Menu.Item>
  );
}

type Props = Omit<ButtonProps, 'onClick'> & {
  userId: number;
  as?: 'menu-item' | 'button';
  onToggleHide?: () => void;
};
