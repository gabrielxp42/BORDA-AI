import React from 'react';
import {createRoot} from 'react-dom/client';
import {MemoryRouter} from 'react-router-dom';
import {Toaster} from 'sonner';
import {Matrizes} from '../../src/pages/Matrizes';
import {SmartCalculatorWorkflow} from '../../src/components/orders/SmartCalculatorWorkflow';

const order = new URLSearchParams(location.search).has('order');
createRoot(document.getElementById('root')!).render(
  <React.StrictMode><MemoryRouter><Toaster />
    {order ? <SmartCalculatorWorkflow mode="standalone" /> : <Matrizes />}
  </MemoryRouter></React.StrictMode>,
);
