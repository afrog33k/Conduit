import React, { useEffect, useState } from 'react';
import Tabs from '@material-ui/core/Tabs';
import Tab from '@material-ui/core/Tab';
import Typography from '@material-ui/core/Typography';
import { Box } from '@material-ui/core';
import { useRouter } from 'next/router';

const tabs = [
  { title: 'Users', isDisabled: false },
  { title: 'Sign-In Method', isDisabled: false },
  { title: 'Service Accounts', isDisabled: false },
  { title: 'Settings', isDisabled: false },
];

export default function authenticationLayout({ children }) {
  const router = useRouter();

  const [value, setValue] = useState(0);
  const handleChange = (event: React.ChangeEvent<any>, newValue: number) => {
    setValue(newValue);
    router.push(`${event.currentTarget.id}`, undefined, { shallow: true });
  };

  return (
    <Box p={4}>
      <Typography variant={'h4'}>Authentication</Typography>
      <Tabs value={value} onChange={handleChange}>
        <Tab label="Users" id="users" />
        <Tab label="Sign in methods" id="signIn" />
        <Tab label="Service accounts" id="serviceAccounts" />
        <Tab label="Settings" id="settings" />
      </Tabs>
      {children}
    </Box>
  );
}
