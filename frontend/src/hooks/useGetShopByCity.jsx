import axios from 'axios';
import React, { useEffect } from 'react';
import { serverUrl } from '../config';
import { useDispatch, useSelector } from 'react-redux';
import { setShopsInMyCity, setUserData } from '../redux/user.slice';

function useGetShopByCity() {
  const dispatch = useDispatch();
  const {currentCity} = useSelector(state=> state.user)
  useEffect(() => {
    const fetchShops = async () => {
      try {
        const result = await axios.get(`${serverUrl}/api/shop/get-by-city/${currentCity}`, {
          withCredentials: true,
        });
       dispatch(setShopsInMyCity(result.data))
      } catch (error) {
        console.log(error);
      }
    };

    fetchShops(); 
  }, [currentCity]);
}

export default useGetShopByCity;
