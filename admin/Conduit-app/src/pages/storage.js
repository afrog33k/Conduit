import { Layout } from '../components/Layout';
import Box from '@material-ui/core/Box';
import Typography from '@material-ui/core/Typography';
import CustomTabs from '../components/CustomTabs';
import React, { useState } from 'react';
import { privateRoute } from '../components/utils/privateRoute';
import StorageFiles from '../components/StorageFiles';
import StorageSettings from '../components/StorageSettings';

const tabs = [{ title: 'Files' }, { title: 'Settings' }];

const Storage = () => {
  const [selected, setSelected] = useState(0);

  const handleChange = (event, newValue) => {
    setSelected(newValue);
  };

  return (
    <Layout itemSelected={5}>
      <Box p={2}>
        <Typography variant={'h4'}>Storage</Typography>
        <CustomTabs tabs={tabs} selected={selected} handleChange={handleChange} />
        <Box role="tabpanel" hidden={selected !== 0} id={`tabpanel-0`}>
          <StorageFiles />
        </Box>
        <Box role="tabpanel" hidden={selected !== 1} id={`tabpanel-1`}>
          <StorageSettings />
        </Box>
      </Box>
    </Layout>
  );
};

export default privateRoute(Storage);
